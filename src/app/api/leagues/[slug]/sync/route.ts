import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { syncNflWeek } from "@/lib/services/sync-nfl-week";
import { requireApiAdmin } from "@/lib/auth/api";

type SyncBody = {
  season?: number;
  week?: number;
};

/** Admin: sync NFL game statuses and resolve TD pick results for the league week. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/sync">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiAdmin(slug);
    if (!access.ok) return access.response;

    const store = getStore();
    const league = access.league;

    let body: SyncBody = {};
    try {
      body = (await request.json()) as SyncBody;
    } catch {
      body = {};
    }

    let season = body.season;
    let week = body.week;

    if ((season == null || week == null) && league.active_week_id) {
      const dashboard = await store.getDashboard(slug);
      if (dashboard) {
        season = season ?? dashboard.week.season;
        week = week ?? dashboard.week.week;
      }
    }

    const summary = await syncNflWeek(store, {
      season,
      week,
      asOf: new Date(),
      leagueId: league.id,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
