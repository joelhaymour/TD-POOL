import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";

/**
 * Member: add one selection from the prop board to a shared slip.
 * Enforces the league's max legs per member and blocks locked slips.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]/legs">,
) {
  try {
    const { slug, parlayId } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    const body = (await request.json()) as { game_prop_id?: string };
    if (!body.game_prop_id) {
      return NextResponse.json(
        { error: "game_prop_id is required", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const store = getStore();
    const found = await store.getParlay(parlayId);
    if (!found || found.parlay.league_id !== access.league.id) {
      return NextResponse.json(
        { error: "Parlay not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    if (found.parlay.status === "locked") {
      return NextResponse.json(
        { error: "This slip is locked", code: "LOCKED" },
        { status: 409 },
      );
    }

    const mine = found.legs.filter((l) => l.member_id === access.member.id);
    const max = access.league.max_props_per_member;
    if (mine.length >= max) {
      return NextResponse.json(
        {
          error: `You have used all ${max} of your picks on this slip`,
          code: "LOCKED",
        },
        { status: 409 },
      );
    }

    const prop = await store.getGameProp(body.game_prop_id);
    if (!prop) {
      return NextResponse.json(
        {
          error: "That selection is no longer on the board — refresh odds",
          code: "NOT_FOUND",
        },
        { status: 404 },
      );
    }

    const leg = await store.addParlayLeg({
      parlay_id: found.parlay.id,
      league_id: access.league.id,
      member_id: access.member.id,
      game_prop_id: prop.id,
      game_id: prop.game_id,
      sportsbook: prop.sportsbook,
      market_key: prop.market_key,
      market_label: prop.market_label,
      player_name: prop.player_name,
      outcome_label: prop.outcome_label,
      line: prop.line,
      american_odds: prop.american_odds,
      decimal_odds: prop.decimal_odds,
      fd_market_id: prop.fd_market_id,
      fd_selection_id: prop.fd_selection_id,
      deep_link: prop.deep_link,
    });
    return NextResponse.json({ leg }, { status: 201 });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
