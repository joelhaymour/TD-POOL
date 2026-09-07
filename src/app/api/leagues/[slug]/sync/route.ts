import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { syncNflWeek } from "@/lib/services/sync-nfl-week";

type SyncBody = {
  adminPin?: string;
  simulateFinal?: boolean;
  season?: number;
  week?: number;
};

/**
 * Admin: sync NFL game statuses and resolve TD pick results for the league week.
 * Body: { adminPin?, simulateFinal?: boolean }
 * When simulateFinal=true, asOf is set far in the future so all games finalize.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/sync">,
) {
  try {
    const { slug } = await context.params;
    const store = getStore();
    const league = await store.getLeagueBySlug(slug);
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    let body: SyncBody = {};
    try {
      body = (await request.json()) as SyncBody;
    } catch {
      body = {};
    }

    if (
      body.adminPin !== undefined &&
      body.adminPin !== league.admin_pin
    ) {
      return NextResponse.json(
        { error: "Invalid admin PIN", code: "FORBIDDEN" },
        { status: 403 },
      );
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

    const asOf = body.simulateFinal
      ? new Date("2099-12-31T23:59:59.000Z")
      : new Date();

    const summary = await syncNflWeek(store, {
      season,
      week,
      asOf,
      leagueId: league.id,
    });

    return NextResponse.json({
      ok: true,
      simulateFinal: Boolean(body.simulateFinal),
      summary,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
