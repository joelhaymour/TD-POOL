import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { autoSyncLeagueOdds } from "@/lib/services/sync-odds";
import { requireApiAdmin } from "@/lib/auth/api";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/odds-sync">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiAdmin(slug);
    if (!access.ok) return access.response;

    const summary = await autoSyncLeagueOdds(slug, { force: true });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
