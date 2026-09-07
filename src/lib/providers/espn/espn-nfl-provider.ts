/**
 * ESPN NFL data provider.
 *
 * Uses ESPN's unofficial public site API (no API key). Endpoints may change
 * without notice — treat responses as best-effort and never throw into the app.
 *
 * Scoreboard: /apis/site/v2/sports/football/nfl/scoreboard
 * Summary:    /apis/site/v2/sports/football/nfl/summary?event={id}
 */

import { getNflWeekForDate } from "@/lib/nfl/calendar";
import { normalizePlayerName } from "@/lib/providers/the-odds-api/maps";
import type {
  NFLDataProvider,
  PlayerTouchdownResult,
  ProviderGame,
  ProviderPlayer,
} from "@/lib/providers/types";

const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const FETCH_TIMEOUT_MS = 12_000;
const SEASON_TYPE_REGULAR = 2;

/** ESPN abbreviations → our 2–3 letter codes. */
const ESPN_ABBR_MAP: Record<string, string> = {
  WSH: "WAS",
  WAS: "WAS",
  LA: "LAR",
  LAR: "LAR",
  JAC: "JAX",
  JAX: "JAX",
  ARZ: "ARI",
  ARI: "ARI",
};

/** Boxscore categories whose TD column is a scored (not thrown) touchdown. */
const SCORED_TD_CATEGORIES = new Set([
  "rushing",
  "receiving",
  "defensive",
  "interceptions",
  "kickReturns",
  "puntReturns",
]);

type EspnStatusType = {
  id?: string;
  name?: string;
  state?: string;
  completed?: boolean;
  description?: string;
};

type EspnTeam = {
  id?: string;
  abbreviation?: string;
  displayName?: string;
  location?: string;
  name?: string;
};

type EspnCompetitor = {
  id?: string;
  homeAway?: string;
  score?: string | number;
  team?: EspnTeam;
  statistics?: unknown[];
};

type EspnOdds = {
  spread?: number;
  overUnder?: number;
  details?: string;
};

type EspnCompetition = {
  id?: string;
  date?: string;
  competitors?: EspnCompetitor[];
  status?: { type?: EspnStatusType; clock?: number; period?: number };
  venue?: { fullName?: string; indoor?: boolean };
  odds?: EspnOdds[];
  pickcenter?: EspnOdds[];
};

type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  competitions?: EspnCompetition[];
  status?: { type?: EspnStatusType };
};

type EspnScoreboard = {
  season?: { year?: number; type?: number };
  week?: { number?: number };
  events?: EspnEvent[];
};

type EspnAthleteRef = {
  id?: string | number;
  displayName?: string;
  fullName?: string;
};

type EspnBoxscoreAthlete = {
  athlete?: EspnAthleteRef;
  stats?: string[];
};

type EspnBoxscoreCategory = {
  name?: string;
  keys?: string[];
  labels?: string[];
  athletes?: EspnBoxscoreAthlete[];
};

type EspnBoxscoreTeam = {
  team?: EspnTeam;
  statistics?: EspnBoxscoreCategory[];
};

type EspnSummary = {
  header?: {
    id?: string;
    season?: { year?: number; type?: number };
    week?: number | { number?: number };
    competitions?: EspnCompetition[];
  };
  boxscore?: {
    players?: EspnBoxscoreTeam[];
  };
  scoringPlays?: Array<{
    text?: string;
    type?: { text?: string; abbreviation?: string };
    scoringType?: { name?: string; abbreviation?: string };
  }>;
  gameInfo?: {
    venue?: { fullName?: string; indoor?: boolean };
  };
};

export type EspnRosterPlayer = {
  external_player_id: string;
  name: string;
  team?: string;
};

function mapTeamAbbr(espnAbbr: string | undefined | null): string {
  if (!espnAbbr) return "";
  const upper = espnAbbr.trim().toUpperCase();
  return ESPN_ABBR_MAP[upper] ?? upper;
}

function mapGameStatus(
  type: EspnStatusType | undefined,
): ProviderGame["status"] {
  const name = (type?.name ?? "").toUpperCase();
  const state = (type?.state ?? "").toLowerCase();

  if (
    name.includes("CANCEL") ||
    name === "STATUS_CANCELED" ||
    name === "STATUS_CANCELLED"
  ) {
    return "canceled";
  }
  if (name.includes("POSTPONE") || name === "STATUS_POSTPONED") {
    return "postponed";
  }
  if (
    type?.completed === true ||
    name === "STATUS_FINAL" ||
    name.includes("FINAL") ||
    state === "post"
  ) {
    return "final";
  }
  if (
    state === "in" ||
    name.includes("IN_PROGRESS") ||
    name.includes("HALFTIME") ||
    name.includes("END_PERIOD") ||
    name.includes("DELAY")
  ) {
    return "in_progress";
  }
  return "scheduled";
}

function parseScore(value: string | number | undefined | null): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function formatDateParam(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function nameExternalId(displayName: string): string {
  return `name:${normalizePlayerName(displayName)}`;
}

function athleteExternalId(
  athleteId: string | number | undefined,
  displayName: string,
): string {
  if (athleteId != null && String(athleteId).trim() !== "") {
    return `espn-${athleteId}`;
  }
  return nameExternalId(displayName);
}

/**
 * Match an ESPN athlete display name to a roster row's external_player_id.
 * Tries exact normalized name, then soft last-name + first-initial matches.
 */
export function matchPlayerExternalId(
  espnName: string,
  roster: EspnRosterPlayer[],
): string | null {
  const key = normalizePlayerName(espnName);
  if (!key) return null;

  const index = new Map(
    roster.map((p) => [normalizePlayerName(p.name), p.external_player_id]),
  );
  if (index.has(key)) return index.get(key)!;

  for (const [norm, id] of index) {
    if (norm === key) return id;
    if (norm.includes(key) || key.includes(norm)) return id;
    const a = norm.split(" ");
    const b = key.split(" ");
    if (
      a.length >= 2 &&
      b.length >= 2 &&
      a.at(-1) === b.at(-1) &&
      a[0]?.[0] === b[0]?.[0]
    ) {
      return id;
    }
  }
  return null;
}

function extractOdds(comp: EspnCompetition | undefined): {
  spread: number | null;
  total: number | null;
} {
  const row = comp?.odds?.[0] ?? comp?.pickcenter?.[0];
  if (!row) return { spread: null, total: null };
  const spread =
    typeof row.spread === "number" && Number.isFinite(row.spread)
      ? row.spread
      : null;
  const total =
    typeof row.overUnder === "number" && Number.isFinite(row.overUnder)
      ? row.overUnder
      : null;
  return { spread, total };
}

function eventToProviderGame(
  event: EspnEvent,
  season: number,
  week: number,
): ProviderGame | null {
  const eventId = event.id != null ? String(event.id) : null;
  if (!eventId) return null;

  const comp = event.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home?.team?.abbreviation || !away?.team?.abbreviation) return null;

  const status = mapGameStatus(comp?.status?.type ?? event.status?.type);
  const { spread, total } = extractOdds(comp);
  const kickoff = comp?.date ?? event.date;
  if (!kickoff) return null;

  const homeScore = parseScore(home.score);
  const awayScore = parseScore(away.score);
  const scoresMatter = status === "in_progress" || status === "final";

  return {
    external_game_id: eventId,
    season,
    week,
    home_team: mapTeamAbbr(home.team.abbreviation),
    away_team: mapTeamAbbr(away.team.abbreviation),
    kickoff_at: new Date(kickoff).toISOString(),
    status,
    spread,
    total,
    stadium: comp?.venue?.fullName ?? null,
    is_dome: Boolean(comp?.venue?.indoor),
    home_score: scoresMatter ? homeScore : null,
    away_score: scoresMatter ? awayScore : null,
  };
}

function tdColumnIndex(category: EspnBoxscoreCategory): number {
  const keys = category.keys ?? [];
  const labels = category.labels ?? [];
  for (let i = 0; i < keys.length; i += 1) {
    const k = (keys[i] ?? "").toLowerCase();
    if (k.includes("touchdown") || k === "td" || k.endsWith("tds")) return i;
  }
  for (let i = 0; i < labels.length; i += 1) {
    if ((labels[i] ?? "").toUpperCase() === "TD") return i;
  }
  return -1;
}

function parseTdCount(raw: string | undefined): number {
  if (raw == null || raw === "") return 0;
  const n = Number.parseInt(String(raw).split("/")[0] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Aggregate scored TDs (rush/rec/def/return) from boxscore; skip thrown passing TDs. */
function touchdownsFromBoxscore(
  summary: EspnSummary,
  externalGameId: string,
  gameStatus: ProviderGame["status"],
): PlayerTouchdownResult[] {
  const byPlayer = new Map<
    string,
    { external_player_id: string; player_name: string; touchdowns: number }
  >();

  for (const teamBlock of summary.boxscore?.players ?? []) {
    for (const category of teamBlock.statistics ?? []) {
      const catName = category.name ?? "";
      if (!SCORED_TD_CATEGORIES.has(catName)) continue;
      const idx = tdColumnIndex(category);
      if (idx < 0) continue;

      for (const row of category.athletes ?? []) {
        const displayName =
          row.athlete?.displayName ?? row.athlete?.fullName ?? "";
        if (!displayName) continue;
        const externalId = athleteExternalId(row.athlete?.id, displayName);
        const tds = parseTdCount(row.stats?.[idx]);
        if (tds <= 0) continue;
        const prev = byPlayer.get(externalId);
        byPlayer.set(externalId, {
          external_player_id: externalId,
          player_name: displayName,
          touchdowns: (prev?.touchdowns ?? 0) + tds,
        });
      }
    }
  }

  // Soft fallback: if boxscore yielded nothing, count scoring-play texts.
  if (byPlayer.size === 0 && (summary.scoringPlays?.length ?? 0) > 0) {
    for (const play of summary.scoringPlays ?? []) {
      const typeText = (
        play.type?.text ??
        play.scoringType?.name ??
        ""
      ).toLowerCase();
      const text = play.text ?? "";
      if (!typeText.includes("touchdown") && !/touchdown/i.test(text)) {
        continue;
      }
      // Skip pure passing attribution — prefer receiver/runner name at start of text.
      if (typeText.includes("passing") && /pass from/i.test(text)) {
        const receiver = text.split(/\d/)[0]?.trim();
        if (receiver) {
          const id = nameExternalId(receiver);
          const prev = byPlayer.get(id);
          byPlayer.set(id, {
            external_player_id: id,
            player_name: receiver,
            touchdowns: (prev?.touchdowns ?? 0) + 1,
          });
        }
        continue;
      }
      if (typeText.includes("rushing") || typeText.includes("receiving")) {
        const scorer = text.split(/\d/)[0]?.trim();
        if (scorer) {
          const id = nameExternalId(scorer);
          const prev = byPlayer.get(id);
          byPlayer.set(id, {
            external_player_id: id,
            player_name: scorer,
            touchdowns: (prev?.touchdowns ?? 0) + 1,
          });
        }
      }
    }
  }

  return [...byPlayer.values()].map((row) => ({
    external_player_id: row.external_player_id,
    player_name: row.player_name,
    external_game_id: externalGameId,
    touchdowns: row.touchdowns,
    game_status: gameStatus,
  }));
}

async function espnFetchJson<T>(
  url: string,
  fetchImpl: typeof fetch,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class EspnNFLProvider implements NFLDataProvider {
  private fetchImpl: typeof fetch;

  constructor(options?: { fetchImpl?: typeof fetch }) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  private scoreboardUrl(params: Record<string, string | number>): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      qs.set(k, String(v));
    }
    return `${ESPN_BASE}/scoreboard?${qs.toString()}`;
  }

  private async fetchScoreboard(
    params: Record<string, string | number>,
  ): Promise<EspnScoreboard | null> {
    return espnFetchJson<EspnScoreboard>(
      this.scoreboardUrl(params),
      this.fetchImpl,
    );
  }

  private async fetchSummary(eventId: string): Promise<EspnSummary | null> {
    const url = `${ESPN_BASE}/summary?event=${encodeURIComponent(eventId)}`;
    return espnFetchJson<EspnSummary>(url, this.fetchImpl);
  }

  async getCurrentWeek(
    asOf: Date = new Date(),
  ): Promise<{ season: number; week: number }> {
    try {
      const board = await this.fetchScoreboard({
        dates: formatDateParam(asOf),
      });

      const weekNum = board?.week?.number;
      let seasonYear = board?.season?.year;
      const seasonType = board?.season?.type;

      if (seasonYear == null && board?.events?.[0]?.date) {
        const d = new Date(board.events[0].date);
        // NFL season year is the calendar year of Week 1 (Sep).
        seasonYear =
          d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
      }

      if (
        weekNum != null &&
        seasonYear != null &&
        (seasonType == null || seasonType === SEASON_TYPE_REGULAR)
      ) {
        return { season: seasonYear, week: weekNum };
      }
    } catch {
      // fall through to calendar
    }

    const mapped = getNflWeekForDate(asOf) ?? getNflWeekForDate(asOf, asOf.getUTCFullYear());
    if (mapped) return mapped;
    return { season: asOf.getUTCFullYear(), week: 1 };
  }

  async getWeekSchedule(season: number, week: number): Promise<ProviderGame[]> {
    try {
      // `dates=YYYY` scopes historical seasons; bare year/week alone can resolve to current season.
      const board = await this.fetchScoreboard({
        seasontype: SEASON_TYPE_REGULAR,
        week,
        dates: season,
      });
      if (!board?.events?.length) return [];

      const resolvedSeason = board.season?.year ?? season;
      const resolvedWeek = board.week?.number ?? week;

      const games: ProviderGame[] = [];
      for (const event of board.events) {
        const game = eventToProviderGame(event, resolvedSeason, resolvedWeek);
        if (game) games.push(game);
      }
      return games;
    } catch {
      return [];
    }
  }

  async getPlayersForWeek(
    _season: number,
    _week: number,
  ): Promise<ProviderPlayer[]> {
    // Roster merge happens upstream from mock / DB; ESPN roster pull is optional.
    return [];
  }

  async getPlayerByExternalId(
    _externalPlayerId: string,
  ): Promise<ProviderPlayer | null> {
    return null;
  }

  async getGameByExternalId(
    externalGameId: string,
  ): Promise<ProviderGame | null> {
    try {
      const summary = await this.fetchSummary(externalGameId);
      const header = summary?.header;
      if (!header?.competitions?.[0]) return null;

      const season = header.season?.year ?? new Date().getUTCFullYear();
      const week =
        typeof header.week === "number"
          ? header.week
          : (header.week?.number ?? 0);

      const synthetic: EspnEvent = {
        id: header.id ?? externalGameId,
        competitions: header.competitions,
        date: header.competitions[0]?.date,
        status: header.competitions[0]?.status,
      };

      const game = eventToProviderGame(synthetic, season, week);
      if (game && !game.stadium && summary?.gameInfo?.venue?.fullName) {
        game.stadium = summary.gameInfo.venue.fullName;
        game.is_dome = Boolean(summary.gameInfo.venue.indoor);
      }
      return game;
    } catch {
      return null;
    }
  }

  async refreshGameStatuses(
    season: number,
    week: number,
    _asOf?: Date,
  ): Promise<ProviderGame[]> {
    // Live scores come from ESPN scoreboard; asOf is unused (API is wall-clock).
    return this.getWeekSchedule(season, week);
  }

  async getPlayerTouchdownsForWeek(
    season: number,
    week: number,
    _asOf?: Date,
  ): Promise<PlayerTouchdownResult[]> {
    try {
      const games = await this.getWeekSchedule(season, week);
      const results: PlayerTouchdownResult[] = [];

      // Bound concurrency so we don't stampede ESPN on a full slate.
      const concurrency = 4;
      let cursor = 0;

      const workers = Array.from({ length: concurrency }, async () => {
        while (cursor < games.length) {
          const index = cursor;
          cursor += 1;
          const game = games[index]!;
          if (game.status !== "final") continue;
          try {
            const summary = await this.fetchSummary(game.external_game_id);
            if (!summary) continue;
            const rows = touchdownsFromBoxscore(
              summary,
              game.external_game_id,
              game.status,
            );
            results.push(...rows);
          } catch {
            // Skip games whose summary/TD parse fails.
          }
        }
      });

      await Promise.all(workers);
      return results;
    } catch {
      return [];
    }
  }
}

export function createEspnNFLProvider(options?: {
  fetchImpl?: typeof fetch;
}): NFLDataProvider {
  return new EspnNFLProvider(options);
}
