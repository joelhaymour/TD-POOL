import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

/**
 * Measured goal-line usage from nflverse play-by-play.
 *
 * The full season CSV is ~19 MB gzipped and 372 columns wide, so it is streamed
 * and folded into small Maps rather than materialized. A full network-to-
 * aggregate pass runs in ~3s and ~105 MB RSS, which is about 1% of the cron's
 * 300s budget.
 */

const PBP_URL = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;

/**
 * nflverse deliberately does not carry Sleeper IDs, and Sleeper's own gsis_id
 * is null for 81% of active skill players (including Bijan Robinson). This is
 * the only public crosswalk between the two.
 */
const CROSSWALK_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

export interface GoalLineWeekRow {
  season: number;
  week: number;
  seasonType: string;
  gsisId: string;
  sleeperId: string | null;
  playerName: string | null;
  team: string;
  inside5Carries: number;
  inside10Carries: number;
  inside5Targets: number;
  inside10Targets: number;
  endzoneTargets: number;
  rushTds: number;
  recTds: number;
  teamInside5Rushes: number;
  teamInside5Plays: number;
  teamInside10Plays: number;
}

export interface GoalLineSeasonRow
  extends Omit<GoalLineWeekRow, "week" | "team"> {
  team: string | null;
  gamesPlayed: number;
  inside5TeamShare: number | null;
}

/**
 * Minimal RFC-4180 splitter. The `desc` column contains commas and quoted
 * text, so naive `split(",")` corrupts every row after it.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

async function* streamCsvRows(
  url: string,
  signal?: AbortSignal,
): AsyncGenerator<{ header: Map<string, number>; row: string[] }> {
  const res = await fetch(url, { signal, redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`nflverse fetch failed ${res.status} for ${url}`);
  }
  const source = Readable.fromWeb(
    res.body as Parameters<typeof Readable.fromWeb>[0],
  );
  const stream = url.endsWith(".gz") ? source.pipe(createGunzip()) : source;
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  let header: Map<string, number> | null = null;
  for await (const line of lines) {
    if (!line) continue;
    const row = splitCsvLine(line);
    if (!header) {
      header = new Map(row.map((name, i) => [name.trim(), i]));
      continue;
    }
    yield { header, row };
  }
}

/** Returns sleeper_id -> gsis_id. */
export async function loadSleeperGsisCrosswalk(
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const bySleeper = new Map<string, string>();
  for await (const { header, row } of streamCsvRows(CROSSWALK_URL, signal)) {
    const gsis = row[header.get("gsis_id") ?? -1]?.trim();
    const sleeper = row[header.get("sleeper_id") ?? -1]?.trim();
    if (gsis && sleeper) bySleeper.set(sleeper, gsis);
  }
  return bySleeper;
}

interface Acc {
  season: number;
  week: number;
  seasonType: string;
  gsisId: string;
  playerName: string | null;
  team: string;
  inside5Carries: number;
  inside10Carries: number;
  inside5Targets: number;
  inside10Targets: number;
  endzoneTargets: number;
  rushTds: number;
  recTds: number;
}

function emptyAcc(
  season: number,
  week: number,
  seasonType: string,
  gsisId: string,
  team: string,
): Acc {
  return {
    season,
    week,
    seasonType,
    gsisId,
    playerName: null,
    team,
    inside5Carries: 0,
    inside10Carries: 0,
    inside5Targets: 0,
    inside10Targets: 0,
    endzoneTargets: 0,
    rushTds: 0,
    recTds: 0,
  };
}

const num = (v: string | undefined): number => {
  if (!v || v === "NA") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: string | undefined): string | null => {
  const s = v?.trim();
  return !s || s === "NA" ? null : s;
};

/**
 * Aggregate one season of play-by-play into per-player-week goal-line usage.
 * Returns null when the season has not been published yet — the 2026 file 404s
 * until games are played, and that is a normal state, not a failure.
 */
export async function fetchSeasonGoalLine(
  season: number,
  signal?: AbortSignal,
  /** Pre-loaded sleeper_id -> gsis_id map; fetched here when omitted. */
  crosswalkOverride?: Map<string, string>,
): Promise<{ weeks: GoalLineWeekRow[]; seasons: GoalLineSeasonRow[] } | null> {
  const players = new Map<string, Acc>();
  // Team denominators are tracked per week so a player's share can be summed
  // over only the weeks he was active.
  const teamWeek = new Map<
    string,
    { i5Rushes: number; i5Plays: number; i10Plays: number }
  >();

  let rows = 0;
  try {
    for await (const { header, row } of streamCsvRows(PBP_URL(season), signal)) {
      rows += 1;
      const seasonType = str(row[header.get("season_type") ?? -1]) ?? "REG";
      if (seasonType !== "REG") continue;

      const yardline = num(row[header.get("yardline_100") ?? -1]);
      if (yardline <= 0 || yardline > 10) continue;

      // Two-point tries sit at the 2 and would otherwise inflate inside-5
      // counts; the attempt flags below exclude them.
      const isRush = num(row[header.get("rush_attempt") ?? -1]) === 1;
      const isPass = num(row[header.get("pass_attempt") ?? -1]) === 1;
      if (!isRush && !isPass) continue;
      if (num(row[header.get("two_point_attempt") ?? -1]) === 1) continue;

      const posteam = str(row[header.get("posteam") ?? -1]);
      const week = num(row[header.get("week") ?? -1]);
      if (!posteam || !week) continue;

      const inside5 = yardline <= 5;
      const teamKey = `${week}|${posteam}`;
      const t = teamWeek.get(teamKey) ?? {
        i5Rushes: 0,
        i5Plays: 0,
        i10Plays: 0,
      };
      t.i10Plays += 1;
      if (inside5) {
        t.i5Plays += 1;
        if (isRush) t.i5Rushes += 1;
      }
      teamWeek.set(teamKey, t);

      // Credit touchdowns only when the scorer is the same player who carried
      // or was targeted, so laterals and fumble returns are not miscredited.
      const tdPlayer = str(row[header.get("td_player_id") ?? -1]);

      if (isRush) {
        const rusher = str(row[header.get("rusher_player_id") ?? -1]);
        if (rusher) {
          const key = `${week}|${rusher}`;
          const acc =
            players.get(key) ??
            emptyAcc(season, week, seasonType, rusher, posteam);
          acc.inside10Carries += 1;
          if (inside5) acc.inside5Carries += 1;
          if (
            num(row[header.get("rush_touchdown") ?? -1]) === 1 &&
            tdPlayer === rusher
          ) {
            acc.rushTds += 1;
          }
          acc.playerName ??= str(row[header.get("rusher_player_name") ?? -1]);
          players.set(key, acc);
        }
      }

      if (isPass) {
        const receiver = str(row[header.get("receiver_player_id") ?? -1]);
        if (receiver) {
          const key = `${week}|${receiver}`;
          const acc =
            players.get(key) ??
            emptyAcc(season, week, seasonType, receiver, posteam);
          acc.inside10Targets += 1;
          if (inside5) acc.inside5Targets += 1;
          // A target thrown to or beyond the goal line.
          if (num(row[header.get("air_yards") ?? -1]) >= yardline) {
            acc.endzoneTargets += 1;
          }
          if (
            num(row[header.get("pass_touchdown") ?? -1]) === 1 &&
            tdPlayer === receiver
          ) {
            acc.recTds += 1;
          }
          acc.playerName ??= str(row[header.get("receiver_player_name") ?? -1]);
          players.set(key, acc);
        }
      }
    }
  } catch (err) {
    // A season that has not started yet returns 404. Treat it as absent.
    if (err instanceof Error && /failed 404/.test(err.message)) return null;
    throw err;
  }
  if (!rows) return null;

  const crosswalk =
    crosswalkOverride ?? (await loadSleeperGsisCrosswalk(signal));
  const gsisToSleeper = new Map<string, string>();
  for (const [sleeperId, gsisId] of crosswalk) gsisToSleeper.set(gsisId, sleeperId);

  const weeks: GoalLineWeekRow[] = [];
  for (const acc of players.values()) {
    const t = teamWeek.get(`${acc.week}|${acc.team}`);
    weeks.push({
      ...acc,
      sleeperId: gsisToSleeper.get(acc.gsisId) ?? null,
      teamInside5Rushes: t?.i5Rushes ?? 0,
      teamInside5Plays: t?.i5Plays ?? 0,
      teamInside10Plays: t?.i10Plays ?? 0,
    });
  }

  const bySeason = new Map<string, GoalLineSeasonRow>();
  for (const w of weeks) {
    const cur =
      bySeason.get(w.gsisId) ??
      ({
        season: w.season,
        seasonType: w.seasonType,
        gsisId: w.gsisId,
        sleeperId: w.sleeperId,
        playerName: w.playerName,
        team: w.team,
        gamesPlayed: 0,
        inside5Carries: 0,
        inside10Carries: 0,
        inside5Targets: 0,
        inside10Targets: 0,
        endzoneTargets: 0,
        rushTds: 0,
        recTds: 0,
        teamInside5Rushes: 0,
        teamInside5Plays: 0,
        teamInside10Plays: 0,
        inside5TeamShare: null,
      } satisfies GoalLineSeasonRow);
    cur.gamesPlayed += 1;
    cur.inside5Carries += w.inside5Carries;
    cur.inside10Carries += w.inside10Carries;
    cur.inside5Targets += w.inside5Targets;
    cur.inside10Targets += w.inside10Targets;
    cur.endzoneTargets += w.endzoneTargets;
    cur.rushTds += w.rushTds;
    cur.recTds += w.recTds;
    cur.teamInside5Rushes += w.teamInside5Rushes;
    cur.teamInside5Plays += w.teamInside5Plays;
    cur.teamInside10Plays += w.teamInside10Plays;
    cur.team = w.team;
    bySeason.set(w.gsisId, cur);
  }
  for (const s of bySeason.values()) {
    s.inside5TeamShare =
      s.teamInside5Rushes > 0
        ? Math.min(1, s.inside5Carries / s.teamInside5Rushes)
        : null;
  }

  return { weeks, seasons: [...bySeason.values()] };
}
