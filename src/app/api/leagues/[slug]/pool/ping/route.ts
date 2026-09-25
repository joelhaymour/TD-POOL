import { NextResponse } from "next/server";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { pingMissingPicks } from "@/lib/notify/events";

/** Nudge everyone in the league who has not made a TD pick this week. */
export async function POST(_r: Request, context: RouteContext<"/api/leagues/[slug]/pool/ping">) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    if (!access.league.sections.td_pool || !access.league.active_week_id) {
      return NextResponse.json({ error: "This league has no TD pool this week", code: "VALIDATION" }, { status: 400 });
    }
    const result = await pingMissingPicks(access.league, access.league.active_week_id, access.member);
    return NextResponse.json(result);
  } catch (err) {
    return storeErrorResponse(err);
  }
}
