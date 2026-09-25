import { after, NextResponse } from "next/server";
import { notifyRide } from "@/lib/notify/events";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";

async function setRide(slug: string, ticketId: string, riding: boolean) {
  const access = await requireApiMembership(slug);
  if (!access.ok) return access.response;
  const store = getStore();
  const found = await store.getParlay(ticketId);
  if (
    !found ||
    found.parlay.league_id !== access.league.id ||
    found.parlay.kind !== "ticket"
  ) {
    return NextResponse.json(
      { error: "Ticket not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  // Riding your own bet is just having placed it.
  if (found.parlay.created_by_member_id === access.member.id) {
    return NextResponse.json(
      { error: "That's your own ticket", code: "VALIDATION" },
      { status: 400 },
    );
  }
  await store.setParlayRide(
    {
      parlay_id: found.parlay.id,
      league_id: access.league.id,
      member_id: access.member.id,
    },
    riding,
  );
  if (riding) {
    const { league, member } = access;
    after(() => notifyRide(league, found, member));
  }
  return NextResponse.json({ riding });
}

/** Member: "I'm riding this". */
export async function PUT(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/tickets/[ticketId]/ride">,
) {
  try {
    const { slug, ticketId } = await context.params;
    return await setRide(slug, ticketId, true);
  } catch (err) {
    return storeErrorResponse(err);
  }
}

/** Member: never mind. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/tickets/[ticketId]/ride">,
) {
  try {
    const { slug, ticketId } = await context.params;
    return await setRide(slug, ticketId, false);
  } catch (err) {
    return storeErrorResponse(err);
  }
}
