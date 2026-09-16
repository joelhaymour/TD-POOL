import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { gameStarted } from "@/lib/props/slip";
import { settleLeagueParlays } from "@/lib/services/settle-parlays";
import { syncNflWeek } from "@/lib/services/sync-nfl-week";
import type { League } from "@/lib/types";

/** Scores and grading only — the board rebuild lives in refresh-td-board. */
export const maxDuration = 60;

/** One scoreboard pull per week per 20s, however many tickers call in. */
const SCORE_SLOT_MS = 20_000;

/**
 * The every-minute ticker: pull scores for weeks that still have a leg in
 * play, then grade. It exists so a parlay settles when its games end rather
 * than when somebody next opens the app.
 *
 * Deliberately cheap: it reads the league's slips, and if nothing is pending
 * on a game that has kicked off it returns without touching a provider. It
 * spends no odds credits — ESPN's scoreboard and box scores are free.
 *
 * Off by default. Set ENABLE_SETTLE_TICK=true where it should run, and give
 * the caller CRON_SECRET as a bearer token.
 */
export async function GET(request: Request) {
  if (process.env.ENABLE_SETTLE_TICK !== "true") {
    return NextResponse.json({ skipped: "Settle ticker is off here" });
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const store = getStore();
  const leagues = (await store.listLeagues()).filter(
    (l): l is League => l.league_type === "group_betting",
  );

  const working: League[] = [];
  const weekIds = new Set<string>();
  for (const league of leagues) {
    const slips = await store.listParlaysForLeague(league.id);
    const pending = slips
      .filter((s) => !s.parlay.settled_at)
      .flatMap((s) => s.legs.filter((l) => l.result === "pending"));
    if (pending.length === 0) continue;

    const games = await store.listGamesByIds([
      ...new Set(pending.map((l) => l.game_id)),
    ]);
    // A leg whose game has not kicked off yet has nothing to report.
    const live = games.filter((g) => gameStarted(g) && g.status !== "canceled");
    if (live.length === 0) continue;

    working.push(league);
    for (const game of live) weekIds.add(game.week_id);
  }

  if (working.length === 0) {
    return NextResponse.json({ ok: true, idle: true, at: new Date().toISOString() });
  }

  const weeks = await store.listWeeks();
  for (const weekId of weekIds) {
    const week = weeks.find((w) => w.id === weekId);
    if (!week) continue;
    const key = `tick:scores:${week.season}-${week.week}`;
    if (!(await store.claimSyncSlot(key, SCORE_SLOT_MS))) continue;
    try {
      await syncNflWeek(store, {
        season: week.season,
        week: week.week,
        scoresOnly: true,
      });
      await store.completeSyncSlot(key, "ok");
    } catch (err) {
      console.error("tick score sync failed", err);
      await store.completeSyncSlot(key, "error").catch(() => {});
    }
  }

  let legsGraded = 0;
  let slipsSettled = 0;
  for (const league of working) {
    try {
      const summary = await settleLeagueParlays(store, league);
      legsGraded += summary.legsGraded;
      slipsSettled += summary.slipsSettled;
    } catch (err) {
      console.error("tick settle failed", league.slug, err);
    }
  }

  return NextResponse.json({
    ok: true,
    leagues: working.length,
    legsGraded,
    slipsSettled,
    at: new Date().toISOString(),
  });
}
