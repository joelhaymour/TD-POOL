import type { TdTier } from "@/lib/types";

/** Configurable weights for the TD Pool Score model. Must sum to ~1.0. */
export const TD_POOL_WEIGHTS = {
  market: 0.35,
  goalLineRedzone: 0.2,
  teamImplied: 0.1,
  recentOpp: 0.1,
  matchup: 0.1,
  share: 0.05,
  injury: 0.05,
  weatherContext: 0.05,
} as const;

export type TdPoolWeightKey = keyof typeof TD_POOL_WEIGHTS;

export interface TdPoolScoreInput {
  /** Market-implied TD probability 0–1. */
  marketProbability: number;
  /** Goal-line / red-zone usage score 0–1. */
  goalLineRedzone: number;
  /** Team implied scoring strength 0–1. */
  teamImplied: number;
  /** Recent opportunity / usage 0–1. */
  recentOpp: number;
  /** Opponent matchup favorability 0–1. */
  matchup: number;
  /** Target / carry share 0–1. */
  share: number;
  /** Injury healthiness 0–1 (1 = fully healthy). */
  injury: number;
  /** Weather / game context 0–1. */
  weatherContext: number;
  /** Optional player name for verdict copy. */
  playerName?: string;
  /** Optional override weights (must still be sensible). */
  weights?: Partial<typeof TD_POOL_WEIGHTS>;
  /** Extra positive bullets. */
  whyWeLike?: string[];
  /** Extra concern bullets. */
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

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function mergeWeights(
  overrides?: Partial<typeof TD_POOL_WEIGHTS>,
): typeof TD_POOL_WEIGHTS {
  if (!overrides) return TD_POOL_WEIGHTS;
  return { ...TD_POOL_WEIGHTS, ...overrides };
}

/**
 * Map our estimated probability to a display tier.
 * Thresholds are intentional decision-support bands, not guarantees.
 */
export function tierFromProbability(probability: number): TdTier {
  const p = clamp01(probability);
  if (p >= 0.55) return "elite";
  if (p >= 0.42) return "strong";
  if (p >= 0.3) return "solid";
  if (p >= 0.18) return "average";
  return "long_shot";
}

/** Convert a 0–1 score into a 1–5 star rating. */
export function scoreToStars(score: number): number {
  const clamped = clamp01(score);
  return Math.max(1, Math.min(5, Math.round(clamped * 4) + 1));
}

/** Render ★ filled / empty for a 1–5 rating. */
export function starRating(stars: number): string {
  const filled = Math.max(1, Math.min(5, Math.round(stars)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

/** Convert a 0–1 factor into stars. */
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

/**
 * Score → probability: compress around market but allow model to diverge.
 * Raw weighted score is treated as a probability-like 0–1 signal.
 */
function scoreToProbability(score: number, marketProbability: number): number {
  const blended = score * 0.7 + clamp01(marketProbability) * 0.3;
  // Soft logistic stretch to avoid extreme 0/1 edges on partial data.
  const stretched = 1 / (1 + Math.exp(-8 * (blended - 0.5)));
  return clamp01(0.55 * blended + 0.45 * stretched);
}

function defaultWhy(
  input: TdPoolScoreInput,
  components: Record<TdPoolWeightKey, number>,
): string[] {
  const bullets: string[] = [];
  if (components.market >= 0.4) {
    bullets.push(
      `Market consensus implies roughly ${Math.round(input.marketProbability * 100)}% TD probability`,
    );
  }
  if (components.goalLineRedzone >= 0.55) {
    bullets.push("Strong goal-line / red-zone usage profile this week");
  }
  if (components.teamImplied >= 0.55) {
    bullets.push("Team is implied for a high scoring environment");
  }
  if (components.matchup >= 0.55) {
    bullets.push("Favorable opponent red-zone / TD matchup");
  }
  if (components.recentOpp >= 0.55) {
    bullets.push("Recent usage trend supports continued TD opportunity");
  }
  if (components.share >= 0.55) {
    bullets.push("Healthy carry / target share relative to teammates");
  }
  if (bullets.length === 0) {
    bullets.push("Balanced profile across market and opportunity factors");
  }
  return bullets;
}

function defaultConcerns(
  input: TdPoolScoreInput,
  components: Record<TdPoolWeightKey, number>,
): string[] {
  const bullets: string[] = [];
  if (components.injury < 0.7) {
    bullets.push("Injury designation may limit snaps or goal-line work");
  }
  if (components.weatherContext < 0.45) {
    bullets.push("Weather / game script could suppress scoring");
  }
  if (components.matchup < 0.4) {
    bullets.push("Opponent has been stingy against this scoring type");
  }
  if (components.recentOpp < 0.4) {
    bullets.push("Recent opportunity has been softer than preferred");
  }
  if (components.market < 0.25) {
    bullets.push("Market prices this as a lower-probability TD outcome");
  }
  if (bullets.length === 0 && input.concerns?.length) {
    return input.concerns;
  }
  return bullets;
}

function buildVerdict(
  name: string | undefined,
  tier: TdTier,
  ourProbability: number,
): string {
  const label = name ?? "This player";
  const pct = Math.round(ourProbability * 100);
  switch (tier) {
    case "elite":
      return `${label} combines elite opportunity with a strong market anchor (~${pct}%). Top-tier TD Pool selection.`;
    case "strong":
      return `${label} profiles as a strong TD Pool pick (~${pct}%) with multiple supportive factors.`;
    case "solid":
      return `${label} is a solid mid-tier option (~${pct}%) — useful if better names are taken.`;
    case "average":
      return `${label} sits in the average band (~${pct}%). Viable only after stronger options are gone.`;
    case "long_shot":
      return `${label} is a long-shot TD Pool selection (~${pct}%). Expect variance and thin usage.`;
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

/**
 * Compute TD Pool Score and decision-support narrative.
 * Factor inputs should be normalized to 0–1 before calling.
 */
export function computeTdPoolScore(input: TdPoolScoreInput): TdPoolScoreResult {
  const weights = mergeWeights(input.weights);
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

  const ourProbability = scoreToProbability(score, input.marketProbability);
  const tier = tierFromProbability(ourProbability);

  const whyWeLike = [
    ...(input.whyWeLike ?? defaultWhy(input, components)),
  ];
  const concerns = [
    ...(input.concerns ?? defaultConcerns(input, components)),
  ];

  return {
    score: Number(score.toFixed(4)),
    ourProbability: Number(ourProbability.toFixed(4)),
    tier,
    whyWeLike,
    concerns,
    verdict: buildVerdict(input.playerName, tier, ourProbability),
    components,
  };
}
