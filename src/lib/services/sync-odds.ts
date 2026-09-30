import { getConfiguredOddsSource, getOddsProvider } from "@/lib/providers";
import { getStore } from "@/lib/store";
import type { Store, SyncSlotStatus } from "@/lib/store/types";
import { gameStarted } from "@/lib/props/slip";
import type { ConsensusOdds, OddsQuote } from "@/lib/providers/types";
import type { NflWeek } from "@/lib/types";

export type OddsSyncSummary = {
  source: "live" | "mock" | "none";
  season: number;
  week: number;
  quotes: number;
  playersUpdated: number;
  fetchedAt: string;
  error?: string;
  /** Provider credits left, when metered. Null when unknown or unlimited. */
  creditsRemaining?: number | null;
  /** Credits spent on this fetch. Null when the provider does not report it. */
  creditsUsed?: number | null;
  /** API book keys we received but do not display. */
  unmappedBookmakers?: string[];
  /** Games in the week that had not kicked off when the sync ran. */
  openGames?: number;
};

/**
 * The Odds API bills 1 credit per game for ≤10 bookmaker keys. We request
 * the five US books plus Bet365 in that same list so a 16-game slate stays
 * ~16 credits. A second region (`uk`/`au`/`ca`) would be ~32. Sync is keyed
 * by NFL week so two leagues do not pay for the same slate.
 */
export const ODDS_SYNC_TTL_MS = 40 * 60 * 60_000;

/**
 * The scheduled morning pull's own window. Shorter than the page-load TTL so
 * back-to-back game days (Sunday then Monday, Wednesday then Thursday) each
 * get their pull, while a double trigger on the same day still can't pay
 * twice. Page loads keep the 40 h window, so opening a league never adds
 * pulls on its own.
 */
export const SCHEDULED_ODDS_SLOT_MS = 20 * 60 * 60_000;
const inFlightOddsSync = new Map<string, Promise<OddsSyncSummary | null>>();

/**
 * A full week prices ~23 players per game. Books post anytime-TD markets game
 * by game — Thursday's first, Sunday's midweek — so a sync the night the week
 * opens can price a fraction of the slate. Holding that for the full TTL left
 * the board mostly blank until Wednesday.
 */
const FULL_BOARD_PLAYERS_PER_GAME = 12;

/**
 * Stop spending when the month's allowance is nearly gone, the way the prop
 * boards already do. It matters more since partial slates retry every 12
 * hours: without a floor, an early-week board that books have barely priced
 * could keep paying to re-read the same handful of games.
 */
function creditFloor(): number {
  const n = Number(process.env.ODDS_CREDIT_FLOOR);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

/** Slot status for a week odds sync: partial boards retry after 12 hours. */
export function weekOddsSlotStatus(summary: OddsSyncSummary): SyncSlotStatus {
  if (summary.playersUpdated <= 0) return "error";
  const open = summary.openGames ?? 0;
  return summary.playersUpdated < open * FULL_BOARD_PLAYERS_PER_GAME
    ? "partial"
    : "ok";
}

export { getConfiguredOddsSource };

/**
 * Refresh anytime TD odds for a league active week.
 * Uses The Odds API when ODDS_API_KEY is set; otherwise synthetic fallback.
 * Throttled through `sync_state` so every serverless instance shares the TTL.
 */
export async function autoSyncLeagueOdds(
  slug: string,
  /** `week`: the just-aligned week — see autoSyncLeagueWeek for why. */
  options: { force?: boolean; week?: NflWeek } = {},
): Promise<OddsSyncSummary | null> {
  const store = getStore();
  let week = options.week;
  if (!week) {
    const dashboard = await store.getDashboard(slug);
    if (!dashboard) return null;
    week = dashboard.week;
  }
  const target = week;

  const weekKey = `odds:week:${target.season}:${target.week}`;
  const existing = inFlightOddsSync.get(weekKey);
  if (existing) return existing;

  const run = (async () => {
    try {
      const claimed = await store.claimSyncSlot(
        weekKey,
        options.force ? 0 : ODDS_SYNC_TTL_MS,
      );
      if (!claimed) return null;

      const summary = await syncWeekOdds(store, {
        season: target.season,
        week: target.week,
        weekId: target.id,
      });
      const detail = {
        source: summary.source,
        quotes: summary.quotes,
        playersUpdated: summary.playersUpdated,
        providerError: summary.error ?? null,
        creditsRemaining: summary.creditsRemaining ?? null,
        creditsUsed: summary.creditsUsed ?? null,
        unmappedBookmakers: summary.unmappedBookmakers ?? [],
      };
      // An empty result must not hold the 40-hour slot, or a missing key or
      // an unposted market keeps the board blank for two days. Errors retry
      // after five minutes, partial slates after 12 hours (see effectiveSyncTtl).
      const status = weekOddsSlotStatus(summary);
      await store.completeSyncSlot(weekKey, status, detail);
      await store.completeSyncSlot(`odds:${slug}`, status, detail);
      return summary;
    } catch (err) {
      await store
        .completeSyncSlot(weekKey, "error", {
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
      inFlightOddsSync.delete(weekKey);
    }
  })();

  inFlightOddsSync.set(weekKey, run);
  return run;
}

export async function syncWeekOdds(
  store: Store,
  args: { season: number; week: number; weekId: string },
): Promise<OddsSyncSummary> {
  const source = getConfiguredOddsSource();

  // The provider reports what is left on every call; the last run stored it.
  const floor = creditFloor();
  const last = await store
    .getSyncState(`odds:week:${args.season}:${args.week}`)
    .catch(() => null);
  const left = last?.detail.creditsRemaining;
  if (source === "live" && typeof left === "number" && left >= 0 && left < floor) {
    return {
      source: "none",
      season: args.season,
      week: args.week,
      quotes: 0,
      playersUpdated: 0,
      fetchedAt: new Date().toISOString(),
      error: `Only ${left} odds credits left this month — keeping the saved prices`,
      creditsRemaining: left,
    };
  }
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

  // applyOddsRefresh deletes the week's odds before inserting, so handing it an
  // empty result wipes every price we already had. A failed refresh should leave
  // the last good odds standing — otherwise one transient provider error erases
  // them until the next success, which on a metered plan may be a day away.
  let playersUpdated = 0;
  if (consensus.length > 0) {
    playersUpdated = await store.applyOddsRefresh({
      weekId: args.weekId,
      consensus,
      quotes,
    });
  }

  const creditsRemaining = provider.getQuotaRemaining?.() ?? null;
  const creditsUsed = provider.getCreditsUsedThisFetch?.() ?? null;
  const unmappedBookmakers = provider.getUnmappedBookmakers?.() ?? [];

  return {
    source: effectiveSource,
    season: args.season,
    week: args.week,
    quotes: quotes.length,
    playersUpdated,
    fetchedAt: new Date().toISOString(),
    error,
    creditsRemaining,
    creditsUsed,
    unmappedBookmakers,
    openGames: games.filter((g) => !gameStarted(g)).length,
  };
}
