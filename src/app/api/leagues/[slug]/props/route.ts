import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import {
  PROPS_SYNC_TTL_MS,
  syncGameProps,
  type PropTier,
} from "@/lib/services/sync-game-props";
import { gameStarted } from "@/lib/props/slip";
import { isCoreMarket, isExtendedMarket } from "@/lib/props/markets";
import type { GameProp } from "@/lib/types";

/** A cold game needs a live provider fetch, which can take a few seconds. */
export const maxDuration = 60;

function newestFetch(props: GameProp[], match: (key: string) => boolean): number {
  return props.reduce(
    (max, p) => (match(p.market_key) ? Math.max(max, Date.parse(p.fetched_at) || 0) : max),
    0,
  );
}

/**
 * Member: one game's FanDuel board. `tier=extended` adds alternate lines and
 * the rest of the markets — a second, larger pull, so it only happens when
 * someone asks. Admins can force a refresh with `refresh=1`.
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

    const tier: PropTier =
      url.searchParams.get("tier") === "extended" ? "extended" : "core";
    const wantsRefresh =
      url.searchParams.get("refresh") === "1" && access.member.role === "admin";

    let props = await store.listGameProps(gameId);
    const match = tier === "core" ? isCoreMarket : isExtendedMarket;
    const loaded = props.some((p) => match(p.market_key));
    const stale =
      !loaded || Date.now() - newestFetch(props, match) > PROPS_SYNC_TTL_MS;

    let note: string | null = null;
    // Pregame markets come down at kickoff, so refreshing then would replace
    // the board with nothing.
    if (gameStarted(game)) {
      if (props.length === 0) note = "This game has kicked off";
    } else if (stale || wantsRefresh) {
      try {
        const result = await syncGameProps(store, game, {
          force: wantsRefresh,
          tier,
        });
        note = result.note;
        if (result.synced) props = await store.listGameProps(gameId);
      } catch (err) {
        // A failed provider call still serves whatever board we have.
        note = err instanceof Error ? err.message : String(err);
      }
    }

    return NextResponse.json({
      game,
      props,
      note,
      extended: props.some((p) => isExtendedMarket(p.market_key)),
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
