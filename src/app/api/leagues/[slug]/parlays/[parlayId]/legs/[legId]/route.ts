import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiAdmin } from "@/lib/auth/api";
import { settleLeagueParlays } from "@/lib/services/settle-parlays";

const MANUAL_RESULTS = new Set(["won", "lost", "push", "void"]);

/**
 * Admin: grade a ticket leg by hand when the box score gets it wrong (a player
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
