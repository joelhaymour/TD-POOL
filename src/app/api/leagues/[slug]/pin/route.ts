import { NextResponse } from "next/server";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { setPinned } from "@/lib/social/pins";

/** Pin this league to the top of your home screen, or unpin it. */
export async function PUT(request: Request, context: RouteContext<"/api/leagues/[slug]/pin">) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    const body = (await request.json().catch(() => ({}))) as { pinned?: unknown };
    const pinned = body.pinned === true;
    await setPinned(access.member.id, pinned);
    return NextResponse.json({ pinned });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
