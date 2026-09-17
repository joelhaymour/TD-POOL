import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { removeTicketImage } from "@/lib/tickets/storage";
import type { ParlayPatch } from "@/lib/store/types";

/** The poster or an admin; a ticket is one person's bet, not the group's. */
async function loadOwned(slug: string, ticketId: string) {
  const access = await requireApiMembership(slug);
  if (!access.ok) return { ok: false as const, response: access.response };
  const store = getStore();
  const found = await store.getParlay(ticketId);
  if (
    !found ||
    found.parlay.league_id !== access.league.id ||
    found.parlay.kind !== "ticket"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Ticket not found", code: "NOT_FOUND" },
        { status: 404 },
      ),
    };
  }
  const mine = found.parlay.created_by_member_id === access.member.id;
  if (!mine && access.member.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Only the poster or an admin can change this ticket", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, store, found };
}

/** Poster/admin: rename, or fix the stake and payout the slip printed. */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/tickets/[ticketId]">,
) {
  try {
    const { slug, ticketId } = await context.params;
    const owned = await loadOwned(slug, ticketId);
    if (!owned.ok) return owned.response;

    const body = (await request.json()) as {
      title?: unknown;
      stake?: unknown;
      book_odds?: unknown;
      book_payout?: unknown;
    };
    const patch: ParlayPatch = {};
    if (typeof body.title === "string" && body.title.trim()) {
      patch.title = body.title.trim().slice(0, 60);
    }
    const money = (v: unknown) =>
      v === null ? null : typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
    if (body.stake !== undefined) {
      const v = money(body.stake);
      if (v === undefined) return NextResponse.json({ error: "Stake must be a number", code: "VALIDATION" }, { status: 400 });
      patch.stake = v;
    }
    if (body.book_payout !== undefined) {
      const v = money(body.book_payout);
      if (v === undefined) return NextResponse.json({ error: "Payout must be a number", code: "VALIDATION" }, { status: 400 });
      patch.book_payout = v;
    }
    if (body.book_odds !== undefined) {
      const v = body.book_odds;
      if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v === 0)) {
        return NextResponse.json({ error: "Odds must be American, like +650", code: "VALIDATION" }, { status: 400 });
      }
      patch.book_odds = v as number | null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to change", code: "VALIDATION" }, { status: 400 });
    }

    const parlay = await owned.store.updateParlay(owned.found.parlay.id, patch);
    return NextResponse.json({ parlay });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

/** Poster/admin: take the ticket down, picture included. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/tickets/[ticketId]">,
) {
  try {
    const { slug, ticketId } = await context.params;
    const owned = await loadOwned(slug, ticketId);
    if (!owned.ok) return owned.response;
    await owned.store.deleteParlay(owned.found.parlay.id);
    if (owned.found.parlay.screenshot_path) {
      await removeTicketImage(owned.found.parlay.screenshot_path);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
