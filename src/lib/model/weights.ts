/**
 * Configurable TD Pool model weights and early-season blending.
 * Keep all tuning knobs here — do not scatter magic numbers in UI code.
 */

/** Influence of each normalized factor when converting adjustments to pp. */
export const TD_MODEL_WEIGHTS = {
  market: 0.4,
  goalLine: 0.2,
  scoringEnvironment: 0.1,
  recentUsage: 0.1,
  matchup: 0.08,
  projection: 0.05,
  injury: 0.04,
  weather: 0.03,
} as const;

export type TdModelWeightKey = keyof typeof TD_MODEL_WEIGHTS;

/**
 * Max absolute probability-point adjustments applied on top of market baseline.
 * Keeps the model explainable and within sensible bounds.
 */
/**
 * Exponential strength of each factor on the expected-touchdowns rate. A
 * percentile of 1.0 multiplies the rate by e^(strength/2), 0.0 divides by it,
 * so goalLine spans roughly 0.74x–1.35x and matchup roughly 0.93x–1.08x.
 */
export const TD_MODEL_RATE_STRENGTH = {
  goalLine: 0.6,
  recentUsage: 0.34,
  matchup: 0.16,
  scoringEnvironment: 0.3,
  projection: 0.12,
  weather: 0.3,
} as const;

/** Final TD Pool % clamp. */
export const TD_POOL_PROBABILITY_BOUNDS = {
  min: 0.02,
  max: 0.75,
} as const;

/**
 * Prior-season vs current-season usage blend by NFL week.
 * Week 1 is 100% prior; weight on prior declines through week 6.
 */
export const EARLY_SEASON_PRIOR_WEIGHT: Record<number, number> = {
  1: 1,
  2: 0.7,
  3: 0.55,
  4: 0.4,
  5: 0.25,
};

export function priorSeasonWeight(week: number): number {
  if (week <= 0) return 1;
  if (week >= 6) return 0;
  return EARLY_SEASON_PRIOR_WEIGHT[week] ?? 0;
}

export function currentSeasonWeight(week: number): number {
  return 1 - priorSeasonWeight(week);
}
