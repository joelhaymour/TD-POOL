import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { autoSyncLeagueOdds } from "@/lib/services/sync-odds";
import { requireApiAdmin } from "@/lib/auth/api";
import { isAppOwner } from "@/lib/auth/owner";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/odds-sync">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiAdmin(slug);
    if (!access.ok) return access.response;
    // Each forced pull spends shared credits; only the owner may (see owner.ts).
    if (!isAppOwner(access.user.email)) {
      return NextResponse.json(
        { error: "Odds refresh on their own schedule", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const summary = await autoSyncLeagueOdds(slug, { force: true });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
