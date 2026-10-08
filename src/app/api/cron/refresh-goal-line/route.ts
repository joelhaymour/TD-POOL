import { NextResponse } from "next/server";
import { syncSeasonGoalLine } from "@/lib/services/sync-goal-line";
import { resolvePoolWeek } from "@/lib/nfl/calendar";
import { cronAuthorized } from "@/lib/auth/cron";

/** Streams and folds a full season of play-by-play; measured at ~3s. */
export const maxDuration = 300;

/**
 * Refresh measured goal-line usage from nflverse play-by-play.
 *
 * Runs weekly rather than on the board path: the source file only changes once
 * games are played, and the board reads the persisted table.
 */
export async function GET(request: Request) {
  if (process.env.ENABLE_CRON_JOBS === "false") {
    return NextResponse.json({ skipped: "Scheduled jobs disabled in this environment" });
  }
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { season } = resolvePoolWeek(new Date());
  const results: Array<{
    season: number;
    weeks: number;
    players: number;
  } | null> = [];

  // The current season 404s until the first games are played. That is expected,
  // not an error — the prior season is what a Week 1 board rates on anyway.
  for (const target of [season, season - 1]) {
    try {
      results.push(await syncSeasonGoalLine(target));
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          season: target,
          error: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    synced: results.filter(Boolean),
    skipped: [season, season - 1].filter((_, i) => results[i] === null),
    at: new Date().toISOString(),
  });
}
