import type { PlayerWeekData } from "@/lib/types";
import { blendModelWithMarket } from "@/lib/providers/sleeper/research";

/** Higher = better anytime-TD pool rank. Market dominates when present. */
export function playerWeekRankKey(pwd: Pick<
  PlayerWeekData,
  "market_probability" | "td_pool_score" | "our_probability" | "consensus_american_odds"
>): number {
  const market =
    pwd.market_probability > 0.01 && pwd.consensus_american_odds !== 0
      ? pwd.market_probability
      : 0;
  return market * 100_000 + pwd.td_pool_score;
}

export function displayOurProbability(pwd: Pick<
  PlayerWeekData,
  "market_probability" | "td_pool_score" | "our_probability" | "consensus_american_odds"
>): number {
  return blendModelWithMarket({
    modelProbability: pwd.our_probability,
    modelScore: pwd.td_pool_score,
    marketProbability:
      pwd.market_probability > 0.01 ? pwd.market_probability : null,
    marketAmerican:
      pwd.consensus_american_odds !== 0 ? pwd.consensus_american_odds : null,
  }).our_probability;
}
