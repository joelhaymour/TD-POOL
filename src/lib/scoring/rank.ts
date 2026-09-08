import type { PlayerWeekData } from "@/lib/types";

/** Higher = better. Rank by proprietary TD Pool % (our_probability). */
export function playerWeekRankKey(pwd: Pick<
  PlayerWeekData,
  "our_probability" | "td_pool_score" | "market_probability" | "consensus_american_odds"
>): number {
  return pwd.our_probability * 1_000_000 + pwd.td_pool_score;
}

/** Display TD Pool % — already the calibrated model output. */
export function displayOurProbability(pwd: Pick<
  PlayerWeekData,
  "our_probability"
>): number {
  return pwd.our_probability;
}

export function hasMarketOdds(pwd: Pick<
  PlayerWeekData,
  "market_probability" | "consensus_american_odds"
>): boolean {
  return (
    pwd.consensus_american_odds !== 0 &&
    Number.isFinite(pwd.consensus_american_odds) &&
    pwd.market_probability > 0.01
  );
}
