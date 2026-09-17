import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { maxLegsPerMember, slipComplete } from "@/lib/props/pick-mode";
import { gameStarted } from "@/lib/props/slip";
import type { GameProp, ParlayLeg } from "@/lib/types";

function locked(error: string) {
  return NextResponse.json({ error, code: "LOCKED" }, { status: 409 });
}

/**
 * Two legs that cannot both win: either side of one line, two moneylines in
 * one game, two first-TD scorers. Several anytime scorers can all hit.
 */
function conflicts(
  a: Pick<ParlayLeg, "game_id" | "market_key" | "player_name">,
  b: Pick<GameProp, "game_id" | "market_key" | "player_name">,
): boolean {
  if (a.game_id !== b.game_id || a.market_key !== b.market_key) return false;
  if (a.market_key === "player_1st_td") return true;
  if (a.market_key === "player_anytime_td") return false;
  return (a.player_name ?? "") === (b.player_name ?? "");
}

/**
 * Member: add one selection from the prop board to a shared slip.
 * Enforces the league's per-member allowance, kickoff and slip locks.
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
    if (found.parlay.settled_at) return locked("This slip is settled");
    if (found.parlay.status === "locked") return locked("This slip is locked");

    const mine = found.legs.filter((l) => l.member_id === access.member.id);
    if (mine.length >= maxLegsPerMember(access.league)) {
      return locked("You've made your pick on this slip");
    }

    const prop = await store.getGameProp(body.game_prop_id);
    if (!prop) {
      return NextResponse.json(
        {
          error: "Those odds just refreshed — reopen the game and pick again",
          code: "NOT_FOUND",
        },
        { status: 404 },
      );
    }

    const game = await store.getGameById(prop.game_id);
    if (gameStarted(game ?? undefined)) {
      return locked("That game has kicked off — pick from a later game");
    }

    const clash = found.legs.find((l) => conflicts(l, prop));
    if (clash) {
      const subject = clash.player_name ?? clash.outcome_label;
      return NextResponse.json(
        {
          error: `Can't pair with ${subject} ${clash.market_label} already on this slip`,
          code: "CONFLICT",
        },
        { status: 409 },
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

    // One pick each: the slip is complete, and locks, when the last member is in.
    let lockedNow = false;
    if (
      slipComplete(
        access.league,
        [...found.legs, leg],
        await store.listMembers(access.league.id),
      )
    ) {
      await store.updateParlay(found.parlay.id, { status: "locked" });
      lockedNow = true;
    }
    return NextResponse.json({ leg, locked: lockedNow }, { status: 201 });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
