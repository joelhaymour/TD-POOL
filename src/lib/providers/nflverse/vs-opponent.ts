import type { ResearchGameLog } from "@/lib/types";
import { normalizeTeamAbbr } from "@/lib/nfl/teams";
import { streamCsvRows } from "@/lib/providers/nflverse/goal-line";
import { VS_OPPONENT_MAX } from "@/lib/providers/sleeper/research";

const STATS_URL = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv.gz`;

/**
 * nflverse weekly box scores, newest season first. One ~1.2 MB gzip per
 * year beats hundreds of Sleeper week calls, and the file goes back far
 * enough that "no recent games vs IND" is actually "they haven't met"
 * rather than "we only looked at last year."
 */
export async function collectNflverseVsOpponent(args: {
  targets: Array<{ sleeperId: string; opponent: string }>;
  /** sleeper_id -> gsis_id */
  crosswalk: Map<string, string>;
  /** Do not include this season/week or later (the game hasn't been played). */
  beforeSeason: number;
  beforeWeek: number;
  oldestSeason?: number;
}): Promise<Map<string, ResearchGameLog[]>> {
  const found = new Map<string, ResearchGameLog[]>();
  const oldest = args.oldestSeason ?? 2014;

  // gsis_id -> the sleeper ids + opponents we still need. A player can only
  // have one upcoming opponent, but the reverse map is what the CSV key is.
  const byGsis = new Map<string, { sleeperId: string; opponent: string }>();
  for (const t of args.targets) {
    if (!t.sleeperId || !t.opponent) continue;
    const gsis = args.crosswalk.get(t.sleeperId);
    if (!gsis) continue;
    byGsis.set(gsis, {
      sleeperId: t.sleeperId,
      opponent: normalizeTeamAbbr(t.opponent),
    });
  }
  if (byGsis.size === 0) return found;

  const needsMore = (sleeperId: string) =>
    (found.get(sleeperId)?.length ?? 0) < VS_OPPONENT_MAX;

  const newestSeason = args.beforeWeek <= 1 ? args.beforeSeason - 1 : args.beforeSeason;

  for (let season = newestSeason; season >= oldest; season -= 1) {
    if (![...byGsis.values()].some((t) => needsMore(t.sleeperId))) break;

    try {
      const seasonHits = await scanSeason(season, args, byGsis, needsMore);
      for (const [sleeperId, logs] of seasonHits) {
        logs.sort((a, b) => b.week - a.week);
        const list = found.get(sleeperId) ?? [];
        for (const log of logs) {
          if (list.length >= VS_OPPONENT_MAX) break;
          list.push(log);
        }
        found.set(sleeperId, list);
      }
    } catch (err) {
      // 2026 (and any unpublished season) 404s. Older holes shouldn't abort
      // the seasons we did get.
      if (isMissingSeason(err)) continue;
      throw err;
    }
  }

  return found;
}

function isMissingSeason(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b404\b/.test(msg);
}

async function scanSeason(
  season: number,
  args: {
    beforeSeason: number;
    beforeWeek: number;
  },
  byGsis: Map<string, { sleeperId: string; opponent: string }>,
  needsMore: (sleeperId: string) => boolean,
): Promise<Map<string, ResearchGameLog[]>> {
  const seasonHits = new Map<string, ResearchGameLog[]>();
  for await (const { header, row } of streamCsvRows(STATS_URL(season))) {
    const seasonType = cell(row, header, "season_type");
    if (seasonType && seasonType !== "REG") continue;

    const gsis = cell(row, header, "player_id");
    if (!gsis) continue;
    const target = byGsis.get(gsis);
    if (!target || !needsMore(target.sleeperId)) continue;

    const week = Number(cell(row, header, "week"));
    if (!Number.isFinite(week) || week < 1) continue;
    if (season === args.beforeSeason && week >= args.beforeWeek) continue;

    const opponent = normalizeTeamAbbr(cell(row, header, "opponent_team"));
    if (opponent !== target.opponent) continue;

    const team = normalizeTeamAbbr(cell(row, header, "team"));
    const gameId = cell(row, header, "game_id");
    const rushTd = num(cell(row, header, "rushing_tds"));
    const recTd = num(cell(row, header, "receiving_tds"));

    const list = seasonHits.get(target.sleeperId) ?? [];
    list.push({
      week,
      season,
      opponent,
      home: isHome(gameId, team),
      touchdowns: rushTd + recTd,
      rz_touches: 0,
      carries: Math.round(num(cell(row, header, "carries"))),
      rush_yards: Math.round(num(cell(row, header, "rushing_yards"))),
      receptions: Math.round(num(cell(row, header, "receptions"))),
      receiving_yards: Math.round(num(cell(row, header, "receiving_yards"))),
      goal_line_chances: 0,
    });
    seasonHits.set(target.sleeperId, list);
  }
  return seasonHits;
}

/** nflverse game_id is `{season}_{week}_{away}_{home}`. */
export function isHome(gameId: string, team: string): boolean {
  const parts = gameId.split("_");
  if (parts.length < 4) return false;
  return normalizeTeamAbbr(parts[parts.length - 1]) === normalizeTeamAbbr(team);
}

function cell(
  row: string[],
  header: Map<string, number>,
  name: string,
): string {
  return (row[header.get(name) ?? -1] ?? "").trim();
}

function num(v: string): number {
  if (!v || v === "NA") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
