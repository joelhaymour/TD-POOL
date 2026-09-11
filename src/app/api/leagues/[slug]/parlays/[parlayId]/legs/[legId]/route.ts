import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiAdmin, requireApiMembership } from "@/lib/auth/api";
import { gameStarted } from "@/lib/props/slip";
import { settleLeagueParlays } from "@/lib/services/settle-parlays";

function locked(error: string) {
  return NextResponse.json({ error, code: "LOCKED" }, { status: 409 });
}

/** Member: remove their own leg before kickoff. Admins can remove any leg. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]/legs/[legId]">,
) {
  try {
    const { slug, parlayId, legId } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    const store = getStore();
    const found = await store.getParlay(parlayId);
    if (!found || found.parlay.league_id !== access.league.id) {
      return NextResponse.json(
        { error: "Parlay not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    const leg = found.legs.find((l) => l.id === legId);
    if (!leg) {
      return NextResponse.json(
        { error: "Leg not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const isAdmin = access.member.role === "admin";
    if (!isAdmin) {
      if (leg.member_id !== access.member.id) {
        return NextResponse.json(
          { error: "You can only remove your own picks", code: "FORBIDDEN" },
          { status: 403 },
        );
      }
      if (found.parlay.settled_at) return locked("This slip is settled");
      if (found.parlay.status === "locked") return locked("This slip is locked");
      const game = await store.getGameById(leg.game_id);
      if (gameStarted(game ?? undefined)) {
        return locked("That game has kicked off — the pick stays on");
      }
    }

    await store.removeParlayLeg(parlayId, legId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

const MANUAL_RESULTS = new Set(["won", "lost", "push", "void"]);

/**
 * Admin: grade a leg by hand when the box score gets it wrong (a player
 * who never took the field, a name ESPN spells differently). "auto" hands the
 * leg back to automatic grading. The slip re-settles immediately.
 */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]/legs/[legId]">,
) {
  try {
    const { slug, parlayId, legId } = await context.params;
    const access = await requireApiAdmin(slug);
    if (!access.ok) return access.response;

    const body = (await request.json()) as { result?: string };
    const result = body.result ?? "";
    if (result !== "auto" && !MANUAL_RESULTS.has(result)) {
      return NextResponse.json(
        { error: "result must be won, lost, push, void or auto", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const store = getStore();
    const found = await store.getParlay(parlayId);
    const leg = found?.legs.find((l) => l.id === legId);
    if (!found || found.parlay.league_id !== access.league.id || !leg) {
      return NextResponse.json(
        { error: "Leg not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    await store.gradeParlayLegs([
      result === "auto"
        ? {
            id: leg.id,
            result: "pending",
            actual_value: null,
            graded_at: null,
            manual_result: false,
          }
        : {
            id: leg.id,
            result: result as "won" | "lost" | "push" | "void",
            actual_value: leg.actual_value,
            graded_at: new Date().toISOString(),
            manual_result: true,
          },
    ]);
    // Reopen so settlement recomputes the slip from its corrected legs.
    await store.updateParlay(parlayId, { settled_at: null });
    await settleLeagueParlays(store, access.league);

    const updated = await store.getParlay(parlayId);
    return NextResponse.json(updated);
  } catch (err) {
    return storeErrorResponse(err);
  }
}
