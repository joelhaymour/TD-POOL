import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";

/** Member: remove their own share link. Admins can remove any. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]/shares/[shareId]">,
) {
  try {
    const { slug, parlayId, shareId } = await context.params;
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

    const share = found.shares.find((s) => s.id === shareId);
    if (!share) {
      return NextResponse.json(
        { error: "Link not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    if (share.member_id !== access.member.id && access.member.role !== "admin") {
      return NextResponse.json(
        { error: "That link belongs to someone else", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    await store.removeParlayShareLink(shareId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
