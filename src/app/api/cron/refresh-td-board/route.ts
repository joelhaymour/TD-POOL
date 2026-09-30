import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { ensureNflWeekMaterialized } from "@/lib/services/ensure-nfl-week";
import {
  syncWeekOdds,
  weekOddsSlotStatus,
  SCHEDULED_ODDS_SLOT_MS,
} from "@/lib/services/sync-odds";
import { resolvePoolWeek } from "@/lib/nfl/calendar";
import { settleLeagueParlays } from "@/lib/services/settle-parlays";
import { syncNflWeek } from "@/lib/services/sync-nfl-week";

/** Full board rebuild — the slowest job in the app. */
export const maxDuration = 300;

/**
 * Wednesday (most anytime-TD props are posted by then, while people are
 * making picks) plus Thursday, Sunday and Monday, the game days. A pull only
 * fetches games that haven't started, so Monday costs about one credit.
 * Roughly 50–65 credits a week, well inside the 500/month quota.
 */
const ODDS_SYNC_WEEKDAYS = new Set([3, 4, 0, 1]);

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
  if (process.env.ENABLE_CRON_JOBS === "false") {
    return NextResponse.json({ skipped: "Scheduled jobs disabled in this environment" });
  }
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
  // The board rebuild is free and runs daily, but odds are metered: a
  // 16-game slate is 16 credits when we pin ≤10 books. Game-day refreshes
  // keep prices fresh where they matter without blowing the 500/month quota.
  //
  // The weekday check lives here rather than in the cron schedule because
  // day-of-week cron expressions need a paid Vercel plan, while a daily trigger
  // works everywhere. The TTL stays as a backstop against double runs.
  const weekKey = `odds:week:${season}:${week}`;
  const claimed =
    isOddsSyncDay(new Date()) &&
    (await store.claimSyncSlot(weekKey, SCHEDULED_ODDS_SLOT_MS).catch(() => false));

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
            creditsUsed: odds.creditsUsed ?? null,
            unmappedBookmakers: odds.unmappedBookmakers ?? [],
          })
          .catch(() => {}),
      ),
    );
    await store.completeSyncSlot(weekKey, weekOddsSlotStatus(odds), {
      source: odds.source,
      quotes: odds.quotes,
      playersUpdated: odds.playersUpdated,
      providerError: odds.error ?? null,
      creditsRemaining: odds.creditsRemaining ?? null,
      creditsUsed: odds.creditsUsed ?? null,
      unmappedBookmakers: odds.unmappedBookmakers ?? [],
    }).catch(() => {});
  }

  // Group parlays and tickets settle here as well. Without it a slip stays
  // pending until somebody opens the app, which is how legs sat overnight.
  let parlaysSettled = 0;
  try {
    await syncNflWeek(store, { season, week, scoresOnly: true });
    const leagues = await store.listLeagues();
    for (const league of leagues.filter(
      (l) => l.sections.group_bets || l.sections.tickets,
    )) {
      const summary = await settleLeagueParlays(store, league);
      parlaysSettled += summary.slipsSettled;
    }
  } catch (err) {
    console.error("cron parlay settlement failed", err);
  }

  return NextResponse.json({
    ok: true,
    season,
    week,
    weekId: nflWeek.id,
    parlaysSettled,
    odds: odds ?? { skipped: "odds TTL not elapsed" },
    at: new Date().toISOString(),
  });
}
