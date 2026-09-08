import { getStore } from "@/lib/store";
import { autoSyncLeagueWeek } from "@/lib/services/sync-nfl-week";
import {
  autoSyncLeagueOdds,
  getConfiguredOddsSource,
} from "@/lib/services/sync-odds";
import { alignLeagueActiveWeek } from "@/lib/services/align-league-week";
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

function emptyResearch(r: LeagueDashboard["ranked_players"][number]["research_json"]) {
  return {
    ...r,
    why_we_like: r.why_we_like?.slice(0, 4) ?? [],
    concerns: r.concerns?.slice(0, 3) ?? [],
    verdict: r.verdict ?? "",
    market: { ...r.market, books: [] },
    // Keep model meta for debugging/recompute, but drop bulky feature snapshots from list payloads.
    td_model: r.td_model
      ? {
          ...r.td_model,
          features: {},
          contributions: r.td_model.contributions?.slice(0, 8) ?? [],
        }
      : undefined,
  };
}

export async function loadLeagueDashboard(
  slug: string,
): Promise<LeagueDashboard | null> {
  const store = getStore();
  const league = await store.getLeagueBySlug(slug);
  if (!league) return null;

  // 1) Make sure we have a board for the league's current pointer (or pool week).
  try {
    await alignLeagueActiveWeek(store, league);
  } catch (err) {
    console.error("alignLeagueActiveWeek failed", err);
  }

  // If the stored board never got the TD engine (or has no market at all), force rebuild.
  try {
    const weekId = (await store.getLeagueBySlug(slug))?.active_week_id;
    if (weekId) {
      const pwd = await store.getPlayerWeekData(weekId);
      const hasEngine = pwd.some((row) => Boolean(row.research_json?.td_model?.version));
      const { TD_POOL_MODEL_VERSION } = await import("@/lib/model/version");
      const staleEngine = pwd.some(
        (row) =>
          Boolean(row.research_json?.td_model?.version) &&
          row.research_json?.td_model?.version !== TD_POOL_MODEL_VERSION,
      );
      const anyMarket = pwd.some((row) => row.market_probability > 0.01);
      const flatScores =
        pwd.length >= 10 &&
        new Set(pwd.map((r) => Math.round(r.our_probability * 100))).size <= 3;
      if (!hasEngine || staleEngine || (!anyMarket && flatScores)) {
        const weeks = await store.listWeeks();
        const week = weeks.find((w) => w.id === weekId);
        if (week) {
          const { ensureNflWeekMaterialized } = await import(
            "@/lib/services/ensure-nfl-week"
          );
          await ensureNflWeekMaterialized(store, week.season, week.week, {
            force: true,
          });
          const { invalidateOddsSyncThrottle } = await import(
            "@/lib/services/odds-throttle"
          );
          invalidateOddsSyncThrottle();
        }
      }
    }
  } catch (err) {
    console.error("stale board force-rebuild failed", err);
  }

  // 2) Grade games/picks + refresh odds for the active week.
  await Promise.all([autoSyncLeagueWeek(slug), autoSyncLeagueOdds(slug)]);

  // 3) If that grading finished the week, advance and materialize next.
  try {
    const fresh = await store.getLeagueBySlug(slug);
    if (fresh) await alignLeagueActiveWeek(store, fresh);
  } catch (err) {
    console.error("alignLeagueActiveWeek (post-sync) failed", err);
  }

  const dashboard = await store.getDashboard(slug);
  if (!dashboard) return null;
  return {
    ...slimDashboard(dashboard),
    odds_source: getConfiguredOddsSource(),
  };
}
