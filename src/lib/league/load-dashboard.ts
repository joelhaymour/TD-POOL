import { getStore } from "@/lib/store";
import { autoSyncLeagueWeek } from "@/lib/services/sync-nfl-week";
import {
  autoSyncLeagueOdds,
  getConfiguredOddsSource,
} from "@/lib/services/sync-odds";
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
    why_we_like: [],
    concerns: [],
    verdict: "",
    market: { ...r.market, books: [] },
  };
}

export async function loadLeagueDashboard(
  slug: string,
): Promise<LeagueDashboard | null> {
  // Auto-grade games/picks + refresh odds — no admin click required
  await Promise.all([autoSyncLeagueWeek(slug), autoSyncLeagueOdds(slug)]);

  const store = getStore();
  const dashboard = await store.getDashboard(slug);
  if (!dashboard) return null;
  return {
    ...slimDashboard(dashboard),
    odds_source: getConfiguredOddsSource(),
  };
}
