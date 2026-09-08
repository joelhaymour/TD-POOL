import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { ensureNflWeekMaterialized } from "@/lib/services/ensure-nfl-week";
import { syncWeekOdds, ODDS_SYNC_TTL_MS } from "@/lib/services/sync-odds";
import { resolvePoolWeek } from "@/lib/nfl/calendar";

/** Full board rebuild — the slowest job in the app. */
export const maxDuration = 300;

/** Thursday, Sunday and Monday — the days NFL games are actually played. */
const ODDS_SYNC_WEEKDAYS = new Set([4, 0, 1]);

/**
 * Whether to spend credits refreshing odds today, judged in US Eastern time so
 * the Monday-night window does not land on Tuesday UTC.
 */
function isOddsSyncDay(now: Date): boolean {
  const eastern = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  return ODDS_SYNC_WEEKDAYS.has(eastern.getDay());
}

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
  // The board rebuild is free and runs daily, but odds are metered: a measured
  // full-slate sync costs ~31 credits against a 500/month allowance, so only
  // about 16 syncs a month are affordable. Refreshing on game-adjacent days
  // buys fresher prices where they matter than spreading them evenly would.
  //
  // The weekday check lives here rather than in the cron schedule because
  // day-of-week cron expressions need a paid Vercel plan, while a daily trigger
  // works everywhere. The TTL stays as a backstop against double runs.
  const claimed =
    isOddsSyncDay(new Date()) &&
    (await store.claimSyncSlot("odds:cron", ODDS_SYNC_TTL_MS).catch(() => false));

  const odds = claimed
    ? await syncWeekOdds(store, { season, week, weekId: nflWeek.id })
    : null;

  // syncWeekOdds is week-scoped and does not touch sync_state, which is keyed
  // per league. Without this the dashboard kept serving the previous run's
  // status note long after the cause had changed.
  if (odds) {
    const leagues = await store.listLeagues().catch(() => []);
    await Promise.all(
      leagues.map((league) =>
        store
          .completeSyncSlot(`odds:${league.slug}`, odds.error ? "error" : "ok", {
            source: odds.source,
            quotes: odds.quotes,
            playersUpdated: odds.playersUpdated,
            providerError: odds.error ?? null,
            creditsRemaining: odds.creditsRemaining ?? null,
          })
          .catch(() => {}),
      ),
    );
    await store.completeSyncSlot("odds:cron", "ok", {}).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    season,
    week,
    weekId: nflWeek.id,
    odds: odds ?? { skipped: "odds TTL not elapsed" },
    at: new Date().toISOString(),
  });
}
