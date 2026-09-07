import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { toPlayerDetail } from "@/lib/api/mappers";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/players/[playerId]">,
) {
  try {
    const { slug, playerId } = await context.params;
    const store = getStore();
    const dashboard = await store.getDashboard(slug);
    if (!dashboard) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const row = dashboard.ranked_players.find((p) => p.player.id === playerId);
    if (!row) {
      return NextResponse.json(
        { error: "Player not found for this week", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      week: dashboard.week,
      picks_locked: dashboard.picks_locked,
      league: {
        id: dashboard.league.id,
        slug: dashboard.league.slug,
        name: dashboard.league.name,
        allow_pick_changes: dashboard.league.allow_pick_changes,
      },
      player: toPlayerDetail(row, dashboard.picks_locked),
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
