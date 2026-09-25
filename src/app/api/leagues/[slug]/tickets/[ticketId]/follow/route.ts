import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { setFollow } from "@/lib/social/follows";

async function follow(slug: string, ticketId: string, following: boolean) {
  const access = await requireApiMembership(slug);
  if (!access.ok) return access.response;
  const found = await getStore().getParlay(ticketId);
  if (!found || found.parlay.league_id !== access.league.id || found.parlay.kind !== "ticket") {
    return NextResponse.json({ error: "Ticket not found", code: "NOT_FOUND" }, { status: 404 });
  }
  await setFollow({ parlayId: ticketId, leagueId: access.league.id, memberId: access.member.id, following });
  return NextResponse.json({ following });
}

/** Member: send me this ticket's updates. */
export async function PUT(_r: Request, context: RouteContext<"/api/leagues/[slug]/tickets/[ticketId]/follow">) {
  try {
    const { slug, ticketId } = await context.params;
    return await follow(slug, ticketId, true);
  } catch (err) {
    return storeErrorResponse(err);
  }
}

export async function DELETE(_r: Request, context: RouteContext<"/api/leagues/[slug]/tickets/[ticketId]/follow">) {
  try {
    const { slug, ticketId } = await context.params;
    return await follow(slug, ticketId, false);
  } catch (err) {
    return storeErrorResponse(err);
  }
}
