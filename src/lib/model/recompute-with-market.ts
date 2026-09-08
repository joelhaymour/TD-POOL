import type { PlayerWeekFeatures } from "@/lib/model/features";
import { computeTdPoolFromFeatures } from "@/lib/model/compute-td-pool";
import { buildDeterministicAnalysis } from "@/lib/model/explain";
import { featuresToResearchJson } from "@/lib/model/build-features";
import type { ResearchJson, TdTier } from "@/lib/types";

export function attachModelMeta(
  research: ResearchJson,
  features: PlayerWeekFeatures,
  model: ReturnType<typeof computeTdPoolFromFeatures>,
): ResearchJson {
  return {
    ...research,
    td_model: {
      version: model.modelVersion,
      data_completeness: model.dataCompleteness,
      limited_data: model.limitedData,
      contributions: model.contributions,
      goal_line_percentile: model.goalLinePercentile,
      matchup_percentile: model.matchupPercentile,
      features: features as unknown as Record<string, unknown>,
      calculated_at: new Date().toISOString(),
    },
  };
}

function tierFromProb(p: number): TdTier {
  if (p >= 0.55) return "elite";
  if (p >= 0.42) return "strong";
  if (p >= 0.3) return "solid";
  if (p >= 0.18) return "average";
  return "long_shot";
}

function featuresFromResearch(research: ResearchJson): PlayerWeekFeatures | null {
  const raw = research.td_model?.features;
  if (!raw) return null;
  return raw as unknown as PlayerWeekFeatures;
}

/**
 * Recompute one player against a full cohort of feature snapshots.
 * Used after odds sync so percentiles/stars stay league-relative.
 */
export function recomputePlayerAgainstCohort(args: {
  research: ResearchJson;
  features: PlayerWeekFeatures;
  cohort: PlayerWeekFeatures[];
}): {
  our_probability: number;
  td_pool_score: number;
  matchup_rating: number;
  goal_line_rating: number;
  research_json: ResearchJson;
  tier: TdTier;
} {
  const model = computeTdPoolFromFeatures(args.features, args.cohort);
  const refreshed = buildDeterministicAnalysis(args.features, model);

  let research = featuresToResearchJson({
    features: args.features,
    history: args.research.history ?? {
      last_5: [],
      vs_opponent: [],
      last_5_summary: "",
      vs_opponent_summary: "",
      recent_trend: "stable",
      scoring_sample: { games: 0, touchdowns: 0 },
    },
    model,
    analysis: refreshed,
    injuryDetail: args.research.injuries.player_detail,
  });
  research.market = {
    consensus_american: args.features.consensusAnytimeTdOdds ?? 0,
    consensus_implied: args.features.marketConsensusProbability ?? 0,
    books: args.research.market.books,
  };
  research = attachModelMeta(research, args.features, model);

  return {
    our_probability: model.tdPoolProbability,
    td_pool_score: model.tdPoolProbability * 1000,
    matchup_rating: model.matchupStars,
    goal_line_rating: model.goalLineStars,
    research_json: research,
    tier: tierFromProb(model.tdPoolProbability),
  };
}

/** Convenience: single-row recompute (prefer cohort path after odds sync). */
export function recomputeWithMarket(args: {
  research: ResearchJson;
  marketProbability: number;
  americanOdds: number;
  books: Array<{ sportsbook: string; american_odds: number }>;
  cohortFeatures?: PlayerWeekFeatures[];
}): {
  our_probability: number;
  td_pool_score: number;
  matchup_rating: number;
  goal_line_rating: number;
  research_json: ResearchJson;
  tier: TdTier;
} | null {
  const base = featuresFromResearch(args.research);
  if (!base) return null;

  const features: PlayerWeekFeatures = {
    ...base,
    marketConsensusProbability: args.marketProbability,
    consensusAnytimeTdOdds: args.americanOdds,
    bestAnytimeTdOdds: args.americanOdds,
    marketBooks: args.books.length,
  };

  const researchWithBooks: ResearchJson = {
    ...args.research,
    market: {
      consensus_american: args.americanOdds,
      consensus_implied: args.marketProbability,
      books: args.books,
    },
  };

  const cohort =
    args.cohortFeatures && args.cohortFeatures.length > 0
      ? args.cohortFeatures.map((f) =>
          f.externalPlayerId === features.externalPlayerId ? features : f,
        )
      : [features];

  return recomputePlayerAgainstCohort({
    research: researchWithBooks,
    features,
    cohort,
  });
}

export { featuresFromResearch };
