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
export const TD_MODEL_ADJUSTMENT_SCALE = {
  goalLine: 0.12,
  scoringEnvironment: 0.06,
  recentUsage: 0.06,
  matchup: 0.05,
  projection: 0.04,
  injury: 0.08,
  weather: 0.03,
} as const;

/** Final TD Pool % clamp. */
export const TD_POOL_PROBABILITY_BOUNDS = {
  min: 0.05,
  max: 0.9,
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
