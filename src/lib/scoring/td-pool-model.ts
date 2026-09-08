/**
 * Legacy seed helpers — prefer `@/lib/model/*` for the live TD Pool engine.
 * Kept so mock seed paths continue to compile.
 */

import type { TdTier } from "@/lib/types";
import { TD_MODEL_WEIGHTS } from "@/lib/model/weights";
import { percentileToStars } from "@/lib/model/stars";
import { clamp01 } from "@/lib/model/math";

/** @deprecated Use TD_MODEL_WEIGHTS from `@/lib/model/weights`. */
export const TD_POOL_WEIGHTS = {
  market: TD_MODEL_WEIGHTS.market,
  goalLineRedzone: TD_MODEL_WEIGHTS.goalLine,
  teamImplied: TD_MODEL_WEIGHTS.scoringEnvironment,
  recentOpp: TD_MODEL_WEIGHTS.recentUsage,
  matchup: TD_MODEL_WEIGHTS.matchup,
  share: TD_MODEL_WEIGHTS.projection,
  injury: TD_MODEL_WEIGHTS.injury,
  weatherContext: TD_MODEL_WEIGHTS.weather,
} as const;

export type TdPoolWeightKey = keyof typeof TD_POOL_WEIGHTS;

export interface TdPoolScoreInput {
  marketProbability: number;
  goalLineRedzone: number;
  teamImplied: number;
  recentOpp: number;
  matchup: number;
  share: number;
  injury: number;
  weatherContext: number;
  playerName?: string;
  weights?: Partial<typeof TD_POOL_WEIGHTS>;
  whyWeLike?: string[];
  concerns?: string[];
}

export interface TdPoolScoreResult {
  score: number;
  ourProbability: number;
  tier: TdTier;
  whyWeLike: string[];
  concerns: string[];
  verdict: string;
  components: Record<TdPoolWeightKey, number>;
}

export function tierFromProbability(probability: number): TdTier {
  const p = clamp01(probability);
  if (p >= 0.55) return "elite";
  if (p >= 0.42) return "strong";
  if (p >= 0.3) return "solid";
  if (p >= 0.18) return "average";
  return "long_shot";
}

export function scoreToStars(score: number): number {
  return percentileToStars(clamp01(score));
}

export function starRating(stars: number): string {
  const filled = Math.max(1, Math.min(5, Math.round(stars)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

export function factorToStarRating(factor: number): string {
  return starRating(scoreToStars(factor));
}

export function tierLabel(tier: TdTier): string {
  switch (tier) {
    case "elite":
      return "ELITE TD PICK";
    case "strong":
      return "STRONG TD PICK";
    case "solid":
      return "SOLID TD PICK";
    case "average":
      return "AVERAGE";
    case "long_shot":
      return "LONG SHOT";
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

/** Seed-only weighted score — live boards use `computeTdPoolFromFeatures`. */
export function computeTdPoolScore(input: TdPoolScoreInput): TdPoolScoreResult {
  const weights = { ...TD_POOL_WEIGHTS, ...input.weights };
  const components: Record<TdPoolWeightKey, number> = {
    market: clamp01(input.marketProbability),
    goalLineRedzone: clamp01(input.goalLineRedzone),
    teamImplied: clamp01(input.teamImplied),
    recentOpp: clamp01(input.recentOpp),
    matchup: clamp01(input.matchup),
    share: clamp01(input.share),
    injury: clamp01(input.injury),
    weatherContext: clamp01(input.weatherContext),
  };

  const score = clamp01(
    components.market * weights.market +
      components.goalLineRedzone * weights.goalLineRedzone +
      components.teamImplied * weights.teamImplied +
      components.recentOpp * weights.recentOpp +
      components.matchup * weights.matchup +
      components.share * weights.share +
      components.injury * weights.injury +
      components.weatherContext * weights.weatherContext,
  );

  const ourProbability = clamp01(
    input.marketProbability * 0.55 + score * 0.45,
  );
  const tier = tierFromProbability(ourProbability);

  return {
    score: Number(score.toFixed(4)),
    ourProbability: Number(ourProbability.toFixed(4)),
    tier,
    whyWeLike: input.whyWeLike ?? ["Seed profile"],
    concerns: input.concerns ?? ["No major usage or matchup concerns."],
    verdict: `${input.playerName ?? "Player"} ~${Math.round(ourProbability * 100)}% TD Pool (seed).`,
    components,
  };
}
