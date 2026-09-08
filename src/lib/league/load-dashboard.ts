import { cache } from "react";
import { getStore } from "@/lib/store";
import { autoSyncLeagueWeek } from "@/lib/services/sync-nfl-week";
import {
  autoSyncLeagueOdds,
  getConfiguredOddsSource,
} from "@/lib/services/sync-odds";
import { alignLeagueActiveWeek } from "@/lib/services/align-league-week";
import { readBoardHealth } from "@/lib/services/ensure-nfl-week";
import type { Store } from "@/lib/store/types";
import type { LeagueDashboard } from "@/lib/types";

/** Strip heavy research blobs from list payloads. */
export function slimDashboard(dashboard: LeagueDashboard): LeagueDashboard {
  return {
    ...dashboard,
    league: {
      ...dashboard.league,
      admin_pin: "",
      join_pin: "",
    },
    members: dashboard.members.map((m) => ({
      ...m,
      member: { ...m.member, pin: null },
      player_week: m.player_week
        ? {
            ...m.player_week,
            research_json: emptyResearch(m.player_week.research_json),
          }
        : null,
    })),
    ranked_players: dashboard.ranked_players.map((row) => ({
      ...row,
      research_json: emptyResearch(row.research_json),
    })),
  };
}

/**
 * The board now carries every skill player, so list payloads keep only what the
 * cards render. Full research is read per player on the analysis route.
 */
function emptyResearch(r: LeagueDashboard["ranked_players"][number]["research_json"]) {
  return {
    ...r,
    why_we_like: [],
    concerns: [],
    verdict: "",
    market: { ...r.market, books: [] },
    history: undefined,
    td_model: r.td_model
      ? {
          ...r.td_model,
          features: {},
          contributions: [],
        }
      : undefined,
  };
}

/**
 * Read-only dashboard load.
 *
 * Provider work never runs here: the board is materialized by the cron job and
 * by `refreshLeagueData`, which callers schedule with `after()` so it cannot
 * delay the response. The one exception is a league with no usable board yet,
 * which must build inline or the page has nothing to show.
 */
export const loadLeagueDashboard = cache(async function loadLeagueDashboard(
  slug: string,
): Promise<LeagueDashboard | null> {
  const store = getStore();
  const league = await store.getLeagueBySlug(slug);
  if (!league) return null;

  if (!(await hasServableBoard(store, league.active_week_id))) {
    try {
      await alignLeagueActiveWeek(store, league);
    } catch (err) {
      console.error("initial board materialize failed", err);
    }
  }

  const dashboard = await store.getDashboard(slug);
  if (!dashboard) return null;

  return {
    ...slimDashboard(dashboard),
    odds_source: await readEffectiveOddsSource(store, slug),
  };
});

/**
 * Report the source the last sync actually used. `getConfiguredOddsSource()`
 * only says whether a key is set, so it reads "live" even when the provider
 * returned nothing usable.
 */
async function readEffectiveOddsSource(
  store: Store,
  slug: string,
): Promise<"live" | "mock" | "none"> {
  try {
    const state = await store.getSyncState(`odds:${slug}`);
    const source = state?.detail.source;
    if (source === "live" || source === "mock" || source === "none") {
      return source;
    }
  } catch {
    // fall through to the configured value
  }
  return getConfiguredOddsSource();
}

async function hasServableBoard(
  store: Store,
  activeWeekId: string | null,
): Promise<boolean> {
  if (!activeWeekId) return false;
  try {
    const pwd = await store.getPlayerWeekData(activeWeekId);
    return pwd.length > 0;
  } catch {
    return false;
  }
}

/**
 * Background refresh. Every step is individually throttled through
 * `sync_state`, so calling this on each request is safe: at most one instance
 * does real provider work per TTL window.
 */
export async function refreshLeagueData(slug: string): Promise<void> {
  const store = getStore();
  try {
    // Outer gate keeps repeated polls from even reaching the inner checks.
    if (!(await store.claimSyncSlot(`refresh:${slug}`, 60_000))) return;

    const league = await store.getLeagueBySlug(slug);
    if (!league) return;

    // Advance to the right week / rebuild a stale board.
    await alignLeagueActiveWeek(store, league);

    await Promise.all([
      autoSyncLeagueWeek(slug).catch(() => null),
      autoSyncLeagueOdds(slug).catch(() => null),
    ]);

    await store.completeSyncSlot(`refresh:${slug}`, "ok");
  } catch (err) {
    console.error("refreshLeagueData failed", err);
    await store.completeSyncSlot(`refresh:${slug}`, "error").catch(() => {});
  }
}

/** True when the stored board is missing, truncated, or on an old model. */
export async function isBoardStale(
  store: Store,
  season: number,
  week: number,
): Promise<boolean> {
  const health = await readBoardHealth(store, season, week);
  return !health.healthy;
}
