import { getConfiguredOddsSource, getOddsProvider } from "@/lib/providers";
import { getStore } from "@/lib/store";
import type { Store } from "@/lib/store/types";
import type { ConsensusOdds, OddsQuote } from "@/lib/providers/types";

export type OddsSyncSummary = {
  source: "live" | "mock" | "none";
  season: number;
  week: number;
  quotes: number;
  playersUpdated: number;
  fetchedAt: string;
  error?: string;
};

/**
 * The Odds API bills one credit per event per market per region, so a single
 * refresh of a full slate costs roughly one credit per game. At the previous
 * 10-minute TTL that was ~32 credits every ten minutes of active use, which
 * exhausted the entire 500/month allowance in about fifteen refreshes and is
 * why the board went to "Unavailable". Anytime-TD prices barely move day to
 * day, so a long TTL costs nothing in accuracy.
 */
export const ODDS_SYNC_TTL_MS = 12 * 60 * 60_000;
const inFlightOddsSync = new Map<string, Promise<OddsSyncSummary | null>>();

export { getConfiguredOddsSource };

/**
 * Refresh anytime TD odds for a league active week.
 * Uses The Odds API when ODDS_API_KEY is set; otherwise synthetic fallback.
 * Throttled through `sync_state` so every serverless instance shares the TTL.
 */
export async function autoSyncLeagueOdds(
  slug: string,
  options: { force?: boolean } = {},
): Promise<OddsSyncSummary | null> {
  const existing = inFlightOddsSync.get(slug);
  if (existing) return existing;

  const run = (async () => {
    const store = getStore();
    const key = `odds:${slug}`;
    try {
      const claimed = await store.claimSyncSlot(
        key,
        options.force ? 0 : ODDS_SYNC_TTL_MS,
      );
      if (!claimed) return null;

      const dashboard = await store.getDashboard(slug);
      if (!dashboard) return null;

      const summary = await syncWeekOdds(store, {
        season: dashboard.week.season,
        week: dashboard.week.week,
        weekId: dashboard.week.id,
      });
      await store.completeSyncSlot(key, "ok", {
        source: summary.source,
        quotes: summary.quotes,
        playersUpdated: summary.playersUpdated,
        // Present when the live feed failed and synthetic prices were used.
        providerError: summary.error ?? null,
      });
      return summary;
    } catch (err) {
      await store
        .completeSyncSlot(key, "error", {
          message: err instanceof Error ? err.message : "Odds sync failed",
        })
        .catch(() => {});
      return {
        source: getConfiguredOddsSource(),
        season: 0,
        week: 0,
        quotes: 0,
        playersUpdated: 0,
        fetchedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Odds sync failed",
      };
    } finally {
      inFlightOddsSync.delete(slug);
    }
  })();

  inFlightOddsSync.set(slug, run);
  return run;
}

export async function syncWeekOdds(
  store: Store,
  args: { season: number; week: number; weekId: string },
): Promise<OddsSyncSummary> {
  const source = getConfiguredOddsSource();
  const players = await store.listPlayers();
  const games = await store.listGamesForWeek(args.weekId);

  const provider = getOddsProvider({
    roster: players
      .filter((p) => p.external_player_id)
      .map((p) => ({
        external_player_id: p.external_player_id!,
        name: p.name,
        team: p.team,
      })),
    games: games
      .filter((g) => g.external_game_id)
      .map((g) => ({
        external_game_id: g.external_game_id!,
        home_team: g.home_team,
        away_team: g.away_team,
      })),
  });

  let consensus: ConsensusOdds[] = [];
  let quotes: OddsQuote[] = [];
  let error: string | undefined;
  let effectiveSource: "live" | "mock" | "none" = source;

  try {
    consensus = await provider.getConsensusAnytimeTdOdds(args.season, args.week);
    quotes = consensus.flatMap((c) => c.books);
    if (source === "live" && consensus.length === 0) {
      throw new Error(
        "The Odds API returned 0 anytime-TD quotes (key may lack player-props access, or market not posted yet)",
      );
    }
  } catch (err) {
    // No synthetic fallback. A generated price is indistinguishable from a real
    // one in the UI, so when the provider has nothing we show nothing.
    error = err instanceof Error ? err.message : "Provider fetch failed";
    consensus = [];
    quotes = [];
    effectiveSource = "none";
  }

  const playersUpdated = await store.applyOddsRefresh({
    weekId: args.weekId,
    consensus,
    quotes,
  });

  return {
    source: effectiveSource,
    season: args.season,
    week: args.week,
    quotes: quotes.length,
    playersUpdated,
    fetchedAt: new Date().toISOString(),
    error,
  };
}
