import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { ensureNflWeekMaterialized } from "@/lib/services/ensure-nfl-week";
import { syncWeekOdds } from "@/lib/services/sync-odds";
import { resolvePoolWeek } from "@/lib/nfl/calendar";

/**
 * Vercel Cron / manual refresh endpoint.
 * Secure with CRON_SECRET bearer token when deployed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const store = getStore();
  const { season, week } = resolvePoolWeek(new Date());
  const nflWeek = await ensureNflWeekMaterialized(store, season, week, {
    force: true,
  });
  const odds = await syncWeekOdds(store, {
    season,
    week,
    weekId: nflWeek.id,
  });

  return NextResponse.json({
    ok: true,
    season,
    week,
    weekId: nflWeek.id,
    odds,
    at: new Date().toISOString(),
  });
}
