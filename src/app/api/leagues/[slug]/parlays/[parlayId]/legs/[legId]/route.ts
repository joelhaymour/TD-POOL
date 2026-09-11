import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";

/** Member: remove their own leg. Admins can remove anyone's. */
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
    if (found.parlay.status === "locked" && access.member.role !== "admin") {
      return NextResponse.json(
        { error: "This slip is locked", code: "LOCKED" },
        { status: 409 },
      );
    }

    const leg = found.legs.find((l) => l.id === legId);
    if (!leg) {
      return NextResponse.json(
        { error: "Leg not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    if (leg.member_id !== access.member.id && access.member.role !== "admin") {
      return NextResponse.json(
        { error: "You can only remove your own picks", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    await store.removeParlayLeg(parlayId, legId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
