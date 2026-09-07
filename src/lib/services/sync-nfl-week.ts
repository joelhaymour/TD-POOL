import { getNFLProvider } from "@/lib/providers";
import { getStore } from "@/lib/store";
import type { Store } from "@/lib/store/types";
import type { League, PickResult } from "@/lib/types";

export type SyncNflWeekOptions = {
  season?: number;
  week?: number;
  asOf?: Date;
  leagueId?: string;
};

export type SyncNflWeekSummary = {
  season: number;
  week: number;
  asOf: string;
  gamesUpdated: number;
  picksResolved: number;
  hits: number;
  misses: number;
  pending: number;
};

/** Avoid hammering sync on every 3–4s client poll. */
const AUTO_SYNC_TTL_MS = 60_000;
const lastAutoSyncAt = new Map<string, number>();
const inFlightAutoSync = new Map<string, Promise<SyncNflWeekSummary | null>>();

/**
 * Automatically refresh game status + pick results for a league's active week.
 * Throttled — safe to call on every dashboard / history load.
 */
export async function autoSyncLeagueWeek(
  slug: string,
  options: { force?: boolean } = {},
): Promise<SyncNflWeekSummary | null> {
  const key = slug;
  const now = Date.now();
  const last = lastAutoSyncAt.get(key) ?? 0;
  if (!options.force && now - last < AUTO_SYNC_TTL_MS) {
    return null;
  }

  const existing = inFlightAutoSync.get(key);
  if (existing) return existing;

  const run = (async () => {
    try {
      const store = getStore();
      const dashboard = await store.getDashboard(slug);
      if (!dashboard) return null;

      const summary = await syncNflWeek(store, {
        season: dashboard.week.season,
        week: dashboard.week.week,
        leagueId: dashboard.league.id,
        asOf: new Date(),
      });
      lastAutoSyncAt.set(key, Date.now());
      return summary;
    } catch {
      // Never break page loads if sync fails
      return null;
    } finally {
      inFlightAutoSync.delete(key);
    }
  })();

  inFlightAutoSync.set(key, run);
  return run;
}

/**
 * Refresh NFL game statuses for a week and resolve pick TD / no-TD results.
 */
export async function syncNflWeek(
  store: Store,
  options: SyncNflWeekOptions = {},
): Promise<SyncNflWeekSummary> {
  const provider = getNFLProvider();
  const asOf = options.asOf ?? new Date();

  let season = options.season;
  let week = options.week;

  if (season == null || week == null) {
    if (provider.getCurrentWeek) {
      const current = await provider.getCurrentWeek(asOf);
      season = season ?? current.season;
      week = week ?? current.week;
    } else {
      season = season ?? 2025;
      week = week ?? 4;
    }
  }

  const empty = (): SyncNflWeekSummary => ({
    season,
    week,
    asOf: asOf.toISOString(),
    gamesUpdated: 0,
    picksResolved: 0,
    hits: 0,
    misses: 0,
    pending: 0,
  });

  const nflWeek = await store.getWeekBySeasonWeek(season, week);
  if (!nflWeek) return empty();

  const storeGames = await store.listGamesForWeek(nflWeek.id);
  let gamesUpdated = 0;

  if (provider.refreshGameStatuses) {
    const refreshed = await provider.refreshGameStatuses(season, week, asOf);
    const byExternal = new Map(
      refreshed.map((g) => [g.external_game_id, g] as const),
    );
    const byMatchup = new Map(
      refreshed.map(
        (g) => [`${g.away_team}@${g.home_team}`, g] as const,
      ),
    );

    const updates = storeGames.flatMap((game) => {
      const next =
        (game.external_game_id
          ? byExternal.get(game.external_game_id)
          : undefined) ??
        byMatchup.get(`${game.away_team}@${game.home_team}`);
      if (!next) return [];
      if (
        game.status === next.status &&
        game.home_score === next.home_score &&
        game.away_score === next.away_score
      ) {
        return [];
      }
      return [
        {
          id: game.id,
          status: next.status,
          home_score: next.home_score,
          away_score: next.away_score,
        },
      ];
    });

    gamesUpdated = await store.updateGameStatuses(updates);
  }

  const gamesAfter = await store.listGamesForWeek(nflWeek.id);
  const gamesById = new Map(gamesAfter.map((g) => [g.id, g]));

  const tdRows = provider.getPlayerTouchdownsForWeek
    ? await provider.getPlayerTouchdownsForWeek(season, week, asOf)
    : [];

  const { matchPlayerExternalId } = await import(
    "@/lib/providers/espn/espn-nfl-provider"
  );
  const rosterForMatch = (await store.listPlayers())
    .filter((p) => p.external_player_id)
    .map((p) => ({
      external_player_id: p.external_player_id!,
      name: p.name,
      team: p.team,
    }));

  const tdByExternalPlayer = new Map<string, (typeof tdRows)[number]>();
  for (const row of tdRows) {
    tdByExternalPlayer.set(row.external_player_id, row);
    if (row.player_name) {
      const matched = matchPlayerExternalId(row.player_name, rosterForMatch);
      if (matched) tdByExternalPlayer.set(matched, row);
    }
  }

  const players = await store.listPlayers();
  const playersById = new Map(players.map((p) => [p.id, p]));
  const playerWeekRows = await store.getPlayerWeekData(nflWeek.id);
  const pwdByPlayerId = new Map(
    playerWeekRows.map((row) => [row.player_id, row] as const),
  );

  const leagues = await resolveTargetLeagues(
    store,
    nflWeek.id,
    options.leagueId,
  );

  let hits = 0;
  let misses = 0;
  let pending = 0;
  const pickUpdates: Array<{
    pickId: string;
    result: PickResult;
    touchdown_scored: boolean | null;
  }> = [];

  for (const league of leagues) {
    const picks = await store.getPicksForWeek(league.id, nflWeek.id);
    for (const pick of picks) {
      const player = playersById.get(pick.player_id);
      const pwd = pwdByPlayerId.get(pick.player_id);
      const game = pwd ? gamesById.get(pwd.game_id) : undefined;

      const externalId = player?.external_player_id ?? null;
      const tdRow = externalId ? tdByExternalPlayer.get(externalId) : undefined;
      const status = tdRow?.game_status ?? game?.status ?? "scheduled";

      let result: PickResult;
      let touchdown_scored: boolean | null;

      if (status === "final") {
        const scored = (tdRow?.touchdowns ?? 0) > 0;
        result = scored ? "td" : "no_td";
        touchdown_scored = scored;
        if (scored) hits += 1;
        else misses += 1;
      } else if (status === "in_progress") {
        result = "game_not_finished";
        touchdown_scored = null;
        pending += 1;
      } else {
        result = "pending";
        touchdown_scored = null;
        pending += 1;
      }

      if (
        pick.result !== result ||
        pick.touchdown_scored !== touchdown_scored
      ) {
        pickUpdates.push({ pickId: pick.id, result, touchdown_scored });
      }
    }
  }

  const picksResolved = await store.resolvePickResults(pickUpdates);

  return {
    season,
    week,
    asOf: asOf.toISOString(),
    gamesUpdated,
    picksResolved,
    hits,
    misses,
    pending,
  };
}

async function resolveTargetLeagues(
  store: Store,
  weekId: string,
  leagueId?: string,
): Promise<League[]> {
  const leagues = await store.listLeagues();
  if (leagueId) {
    return leagues.filter((l) => l.id === leagueId);
  }

  const matched: League[] = [];
  for (const league of leagues) {
    if (league.active_week_id === weekId) {
      matched.push(league);
      continue;
    }
    const picks = await store.getPicksForWeek(league.id, weekId);
    if (picks.length > 0) matched.push(league);
  }
  return matched;
}
