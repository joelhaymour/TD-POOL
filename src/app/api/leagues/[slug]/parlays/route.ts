import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";

function requireGroupBetting(league: { league_type: string }) {
  if (league.league_type !== "group_betting") {
    return NextResponse.json(
      { error: "This league is not a group betting league", code: "FORBIDDEN" },
      { status: 403 },
    );
  }
  return null;
}

/** Member: all parlays for the active week, with legs. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    const blocked = requireGroupBetting(access.league);
    if (blocked) return blocked;

    if (!access.league.active_week_id) {
      return NextResponse.json({ parlays: [] });
    }
    const store = getStore();
    const parlays = await store.listParlays(
      access.league.id,
      access.league.active_week_id,
    );
    return NextResponse.json({ parlays });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

/** Member: start a new shared parlay slip for the active week. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/parlays">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    const blocked = requireGroupBetting(access.league);
    if (blocked) return blocked;

    if (!access.league.active_week_id) {
      return NextResponse.json(
        { error: "League has no active week yet", code: "VALIDATION" },
        { status: 400 },
      );
    }

    let title = "";
    try {
      const body = (await request.json()) as { title?: string };
      title = body.title?.trim() ?? "";
    } catch {
      // Empty body is fine — default title below.
    }

    const store = getStore();
    const parlay = await store.createParlay({
      league_id: access.league.id,
      week_id: access.league.active_week_id,
      title: title || `${access.member.display_name}'s parlay`,
      created_by_member_id: access.member.id,
    });
    return NextResponse.json({ parlay }, { status: 201 });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
