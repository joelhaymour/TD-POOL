import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { toBetSlipLegs } from "@/lib/api/mappers";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/bet-slip">,
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

    const legs = toBetSlipLegs(dashboard.members);

    return NextResponse.json({
      week: dashboard.week,
      league: {
        id: dashboard.league.id,
        slug: dashboard.league.slug,
        name: dashboard.league.name,
        currency: dashboard.league.currency,
        betting_mode: dashboard.league.betting_mode,
      },
      legs,
      stake: dashboard.parlay.stake,
      parlay: dashboard.parlay,
      showMoney: dashboard.league.betting_mode !== "none",
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
