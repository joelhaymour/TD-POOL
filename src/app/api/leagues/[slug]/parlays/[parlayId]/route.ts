import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import type { ParlayPatch } from "@/lib/store/types";

function notFound() {
  return NextResponse.json(
    { error: "Parlay not found", code: "NOT_FOUND" },
    { status: 404 },
  );
}

function forbidden(error: string) {
  return NextResponse.json({ error, code: "FORBIDDEN" }, { status: 403 });
}

/** Member: one parlay with its legs. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]">,
) {
  try {
    const { slug, parlayId } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    const found = await getStore().getParlay(parlayId);
    if (!found || found.parlay.league_id !== access.league.id) return notFound();
    return NextResponse.json(found);
  } catch (err) {
    return storeErrorResponse(err);
  }
}

/**
 * Edit a slip. Locking (the bet is placed, no more changes) is any member's
 * call on an open slip and an admin's otherwise; the stake and title can also
 * be set by whoever started the slip.
 */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays/[parlayId]">,
) {
  try {
    const { slug, parlayId } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    const store = getStore();
    const found = await store.getParlay(parlayId);
    if (!found || found.parlay.league_id !== access.league.id) return notFound();
    if (found.parlay.settled_at) {
      return NextResponse.json(
        { error: "This slip is settled", code: "LOCKED" },
        { status: 409 },
      );
    }

    const isAdmin = access.member.role === "admin";
    const isCreator = found.parlay.created_by_member_id === access.member.id;
    const body = (await request.json()) as {
      status?: unknown;
      stake?: unknown;
      title?: unknown;
    };
    const patch: ParlayPatch = {};

    if (body.status !== undefined) {
      // An open slip is locked in by whoever places the bet; a one-each slip
      // locks itself when the last member is in. Only an admin ever unlocks.
      const memberMayLock =
        access.league.pick_mode === "open" && body.status === "locked";
      if (!isAdmin && !memberMayLock) {
        return forbidden("Only an admin can change whether a slip is locked");
      }
      if (body.status !== "open" && body.status !== "locked") {
        return NextResponse.json(
          { error: "status must be open or locked", code: "VALIDATION" },
          { status: 400 },
        );
      }
      patch.status = body.status;
    }

    if (body.stake !== undefined || body.title !== undefined) {
      if (!isAdmin && !isCreator) {
        return forbidden("Only the slip's creator or an admin can edit it");
      }
    }
    if (body.stake !== undefined) {
      const stake = body.stake === null ? null : Number(body.stake);
      if (stake !== null && (!Number.isFinite(stake) || stake < 0 || stake > 100_000)) {
        return NextResponse.json(
          { error: "Stake must be between 0 and 100,000", code: "VALIDATION" },
          { status: 400 },
        );
      }
      patch.stake = stake === null ? null : Math.round(stake * 100) / 100;
    }
    if (body.title !== undefined) {
      const title = String(body.title ?? "").trim().slice(0, 60);
      if (!title) {
        return NextResponse.json(
          { error: "Give the slip a name", code: "VALIDATION" },
          { status: 400 },
        );
      }
      patch.title = title;
    }

    const parlay = await store.updateParlay(parlayId, patch);
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
    if (!found || found.parlay.league_id !== access.league.id) return notFound();
    const isAdmin = access.member.role === "admin";
    const isCreator = found.parlay.created_by_member_id === access.member.id;
    if (!isAdmin && !isCreator) {
      return forbidden("Only the creator or an admin can delete a slip");
    }
    await store.deleteParlay(parlayId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
