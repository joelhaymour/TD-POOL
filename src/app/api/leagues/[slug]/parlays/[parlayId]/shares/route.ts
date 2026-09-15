import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { parseShareLink } from "@/lib/props/sportsbooks";

/**
 * Member: paste the share link for a slip they placed at their book.
 *
 * The link becomes a button the rest of the league taps, so the host has to
 * belong to a known sportsbook — an open text field here would turn a slip
 * into a place to post any link at all. One link per member per book.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]/shares">,
) {
  try {
    const { slug, parlayId } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    const body = (await request.json()) as { url?: string; note?: string };
    const parsed = parseShareLink(body.url ?? "");
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error, code: "VALIDATION" },
        { status: 400 },
      );
    }

    const note = (body.note ?? "").trim().slice(0, 140) || null;

    const store = getStore();
    const found = await store.getParlay(parlayId);
    if (!found || found.parlay.league_id !== access.league.id) {
      return NextResponse.json(
        { error: "Parlay not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const share = await store.saveParlayShareLink({
      parlay_id: found.parlay.id,
      league_id: access.league.id,
      member_id: access.member.id,
      sportsbook: parsed.sportsbook,
      url: parsed.url,
      note,
    });
    return NextResponse.json({ share }, { status: 201 });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
