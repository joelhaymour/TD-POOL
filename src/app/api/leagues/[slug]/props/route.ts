import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { syncGameProps } from "@/lib/services/sync-game-props";

/** A cold game needs a live provider fetch, which can take a few seconds. */
export const maxDuration = 60;

/**
 * Member: the full FanDuel prop board for one game.
 * Syncs from The Odds API when the board is empty or stale-forced (?refresh=1,
 * admin only — a forced refresh spends ~15 credits).
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/props">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    const url = new URL(request.url);
    const gameId = url.searchParams.get("game");
    if (!gameId) {
      return NextResponse.json(
        { error: "game query param is required", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const store = getStore();
    const game = await store.getGameById(gameId);
    if (!game) {
      return NextResponse.json(
        { error: "Game not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const wantsRefresh =
      url.searchParams.get("refresh") === "1" &&
      access.member.role === "admin";

    let props = await store.listGameProps(gameId);
    let note: string | null = null;
    if (props.length === 0 || wantsRefresh) {
      try {
        const result = await syncGameProps(store, game, {
          force: wantsRefresh,
        });
        note = result.note;
        if (result.synced) props = await store.listGameProps(gameId);
      } catch (err) {
        // A failed provider call still serves whatever board we have.
        note = err instanceof Error ? err.message : String(err);
      }
    }

    return NextResponse.json({ game, props, note });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
