import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/history">,
) {
  try {
    const { slug } = await context.params;
    const store = getStore();
    const dashboard = await store.getDashboard(slug);
    if (!dashboard) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const picks = dashboard.members
      .filter((m) => m.pick && m.player)
      .map((m) => ({
        memberId: m.member.id,
        memberName: m.member.display_name,
        playerId: m.player!.id,
        playerName: m.player!.name,
        team: m.player!.team,
        result: m.pick!.result,
        americanOdds:
          m.player_week?.consensus_american_odds ?? m.pick!.odds_at_selection,
      }));

    return NextResponse.json({
      league: {
        id: dashboard.league.id,
        slug: dashboard.league.slug,
        name: dashboard.league.name,
      },
      weeks: [
        {
          week: dashboard.week,
          picks_submitted: dashboard.parlay.picks_submitted,
          picks_total: dashboard.parlay.picks_total,
          parlay: dashboard.parlay,
          picks,
          status: dashboard.picks_locked ? "locked" : "open",
        },
      ],
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
