import type { FactorContribution, PlayerWeekFeatures, TdPoolModelOutput } from "@/lib/model/features";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Deterministic overview / why / concerns from structured model output. */
export function buildDeterministicAnalysis(
  features: PlayerWeekFeatures,
  model: TdPoolModelOutput,
): {
  overview: string;
  whyWeLike: string[];
  concerns: string[];
  verdict: string;
} {
  const positives = [...model.contributions]
    .filter((c) => c.key !== "market" && c.delta > 0.008)
    .sort((a, b) => b.delta - a.delta);

  const negatives = [...model.contributions]
    .filter((c) => c.delta < -0.008)
    .sort((a, b) => a.delta - b.delta);

  const whyWeLike: string[] = [];
  for (const c of positives.slice(0, 4)) {
    whyWeLike.push(formatContributionBullet(features, c, model));
  }
  if (features.marketConsensusProbability != null && whyWeLike.length < 2) {
    whyWeLike.push(
      `Market consensus prices anytime TD near ${pct(features.marketConsensusProbability)}.`,
    );
  }
  if (!whyWeLike.length) {
    whyWeLike.push("Balanced profile — no single dominant edge this week.");
  }

  const concerns: string[] = [];
  for (const c of negatives.slice(0, 3)) {
    concerns.push(formatContributionBullet(features, c, model));
  }
  if (
    model.marketProbability != null &&
    model.tdPoolProbability - model.marketProbability >= 0.05
  ) {
    concerns.push(
      `Market probability is ${pct(model.marketProbability)} — ${Math.round((model.tdPoolProbability - model.marketProbability) * 100)} pts below our TD Pool estimate.`,
    );
  }
  if (!concerns.length) {
    concerns.push("No major usage or matchup concerns.");
  }

  const overview =
    positives[0] != null
      ? `${features.playerName}: ${positives[0]!.detail} supports a ${pct(model.tdPoolProbability)} TD Pool profile.`
      : `${features.playerName} projects to a ${pct(model.tdPoolProbability)} anytime TD Pool probability this week.`;

  const verdict = model.limitedData
    ? `Limited data (${Math.round(model.dataCompleteness * 100)}% complete) — treat ${pct(model.tdPoolProbability)} as a lower-confidence estimate.`
    : `TD Pool combines market expectations with opportunity, matchup, and game context → ${pct(model.tdPoolProbability)}.`;

  return { overview, whyWeLike, concerns, verdict };
}

function formatContributionBullet(
  features: PlayerWeekFeatures,
  c: FactorContribution,
  model: TdPoolModelOutput,
): string {
  const sign = c.delta >= 0 ? "+" : "";
  switch (c.key) {
    case "goalLine":
      if (features.inside5TeamShare != null && features.inside5TeamShare >= 0.4) {
        return `${Math.round(features.inside5TeamShare * 100)}% estimated inside-5 share (${Math.round(model.goalLinePercentile * 100)}th pct).`;
      }
      return `${c.detail} (${sign}${(c.delta * 100).toFixed(1)} pts).`;
    case "scoringEnvironment":
      return features.teamImpliedPoints != null
        ? `${features.team} implied for ${features.teamImpliedPoints.toFixed(1)} points.`
        : c.detail;
    case "matchup":
      return features.opponentPositionTdRank != null
        ? `Opponent ranks #${features.opponentPositionTdRank} vs ${features.position} TD scoring (${features.opponentDataLabel}).`
        : c.detail;
    case "recentUsage":
      return `Recent role trend: ${features.recentTouchTrend} · ${c.detail}`;
    default:
      return c.detail;
  }
}
