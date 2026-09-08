import { NextResponse } from "next/server";

/**
 * Report the odds provider's remaining credit balance.
 *
 * The /sports endpoint does not count against the quota, so this is a free way
 * to check the balance and to measure what a sync actually costs by reading it
 * either side of a run.
 */
export async function GET() {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ configured: false });
  }

  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`,
    { cache: "no-store" },
  );
  const remaining = Number(res.headers.get("x-requests-remaining"));
  const used = Number(res.headers.get("x-requests-used"));
  const lastCall = Number(res.headers.get("x-requests-last"));

  // /events is also free, and the number of events inside the sync window is
  // exactly what a refresh gets billed for.
  const evRes = await fetch(
    `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`,
    { cache: "no-store" },
  );
  const events = evRes.ok
    ? ((await evRes.json()) as Array<{
        commence_time: string;
        home_team: string;
        away_team: string;
      }>)
    : [];

  const now = Date.now();
  const inWindow = events
    .filter((e) => {
      const t = Date.parse(e.commence_time);
      return (
        Number.isFinite(t) &&
        t >= now - 6 * 60 * 60_000 &&
        t <= now + 7 * 24 * 60 * 60_000
      );
    })
    .sort((a, b) => a.commence_time.localeCompare(b.commence_time));

  return NextResponse.json({
    configured: true,
    ok: res.ok,
    remaining: Number.isFinite(remaining) ? remaining : null,
    used: Number.isFinite(used) ? used : null,
    lastCallCost: Number.isFinite(lastCall) ? lastCall : null,
    totalEvents: events.length,
    eventsInWindow: inWindow.length,
    windowDays: inWindow.map((e) => e.commence_time.slice(0, 10)),
  });
}
