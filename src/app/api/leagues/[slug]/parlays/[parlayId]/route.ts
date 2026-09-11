import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiAdmin, requireApiMembership } from "@/lib/auth/api";
import { buildFanduelParlayUrl } from "@/lib/props/fanduel-link";

/** Member: one parlay with its legs and the FanDuel deep link. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]">,
) {
  try {
    const { slug, parlayId } = await context.params;
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
    const link = buildFanduelParlayUrl(found.legs);
    return NextResponse.json({
      ...found,
      fanduel_url: link.url,
      unmatched_legs: link.unmatched.map((l) => l.id),
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

/** Admin: lock/unlock a slip so legs stop changing once the bet is placed. */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]">,
) {
  try {
    const { slug, parlayId } = await context.params;
    const access = await requireApiAdmin(slug);
    if (!access.ok) return access.response;

    const body = (await request.json()) as { status?: string };
    if (body.status !== "open" && body.status !== "locked") {
      return NextResponse.json(
        { error: "status must be open or locked", code: "VALIDATION" },
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
    const parlay = await store.setParlayStatus(parlayId, body.status);
    return NextResponse.json({ parlay });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

/** Admin (or the creator): delete a slip. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]">,
) {
  try {
    const { slug, parlayId } = await context.params;
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
    const isAdmin = access.member.role === "admin";
    const isCreator = found.parlay.created_by_member_id === access.member.id;
    if (!isAdmin && !isCreator) {
      return NextResponse.json(
        { error: "Only the creator or an admin can delete a slip", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    await store.deleteParlay(parlayId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
