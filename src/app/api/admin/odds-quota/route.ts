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

  return NextResponse.json({
    configured: true,
    ok: res.ok,
    remaining: Number.isFinite(remaining) ? remaining : null,
    used: Number.isFinite(used) ? used : null,
    lastCallCost: Number.isFinite(lastCall) ? lastCall : null,
  });
}
