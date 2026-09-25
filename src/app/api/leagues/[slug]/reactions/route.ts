import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadReactions, setReaction, type ReactionTarget } from "@/lib/social/reactions";

const bad = (error: string) => NextResponse.json({ error, code: "VALIDATION" }, { status: 400 });

/** Thumbs on the given picks: GET ?picks=id,id */
export async function GET(request: Request, context: RouteContext<"/api/leagues/[slug]/reactions">) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    const ids = (new URL(request.url).searchParams.get("picks") ?? "").split(",").filter(Boolean).slice(0, 200);
    const map = await loadReactions("pick", ids, access.member.id);
    return NextResponse.json({ picks: Object.fromEntries(map) });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

/** Thumbs up (1), down (-1) or take it back (0) on a ticket or a pick in this league. */
export async function PUT(request: Request, context: RouteContext<"/api/leagues/[slug]/reactions">) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    const body = (await request.json().catch(() => ({}))) as { target?: string; targetId?: string; value?: number };
    const target = body.target as ReactionTarget;
    const value = body.value;
    if (target !== "ticket" && target !== "pick") return bad("target must be ticket or pick");
    if (!body.targetId || typeof body.targetId !== "string") return bad("targetId is required");
    if (value !== 1 && value !== -1 && value !== 0) return bad("value must be 1, -1 or 0");

    if (target === "ticket") {
      const found = await getStore().getParlay(body.targetId);
      if (!found || found.parlay.league_id !== access.league.id || found.parlay.kind !== "ticket") {
        return NextResponse.json({ error: "Ticket not found", code: "NOT_FOUND" }, { status: 404 });
      }
    } else {
      const { data } = await createAdminClient()
        .from("picks")
        .select("id")
        .eq("id", body.targetId)
        .eq("league_id", access.league.id)
        .maybeSingle();
      if (!data) return NextResponse.json({ error: "Pick not found", code: "NOT_FOUND" }, { status: 404 });
    }

    await setReaction({ leagueId: access.league.id, memberId: access.member.id, target, targetId: body.targetId, value });
    const summary = (await loadReactions(target, [body.targetId], access.member.id)).get(body.targetId) ?? {
      up: 0,
      down: 0,
      mine: 0,
    };
    return NextResponse.json({ reactions: summary });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
