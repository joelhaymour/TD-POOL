import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { autoSyncLeagueOdds } from "@/lib/services/sync-odds";

export async function POST(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/odds-sync">,
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      adminPin?: string;
      force?: boolean;
    };

    const store = getStore();
    const league = await store.getLeagueBySlug(slug);
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (!body.adminPin || body.adminPin !== league.admin_pin) {
      return NextResponse.json(
        { error: "Invalid admin PIN", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const summary = await autoSyncLeagueOdds(slug, { force: true });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
