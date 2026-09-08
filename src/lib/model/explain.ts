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
  // Injury never belongs in "why we like" — even if a contribution sign is wrong.
  const positives = [...model.contributions]
    .filter((c) => c.key !== "market" && c.key !== "injury" && c.delta > 0.008)
    .sort((a, b) => b.delta - a.delta);

  const negatives = [...model.contributions]
    .filter((c) => c.delta < -0.008)
    .sort((a, b) => a.delta - b.delta);

  const whyWeLike: string[] = [];
  for (const c of positives.slice(0, 4)) {
    whyWeLike.push(formatContributionBullet(features, c, model));
  }

  // Feature-backed fillers when contribution list is thin (common early season).
  if (
    whyWeLike.length < 2 &&
    features.redZoneTouchesPerGame != null &&
    features.redZoneTouchesPerGame >= 1
  ) {
    whyWeLike.push(
      `${features.redZoneTouchesPerGame.toFixed(1)} red-zone touches per game (${Math.round(model.goalLinePercentile * 100)}th pct goal-line).`,
    );
  }
  if (
    whyWeLike.length < 2 &&
    features.teamImpliedPoints != null &&
    features.teamImpliedPoints >= 21
  ) {
    whyWeLike.push(
      `${features.team} implied for ${features.teamImpliedPoints.toFixed(1)} points — elevated scoring environment.`,
    );
  }
  if (
    whyWeLike.length < 2 &&
    features.opponentPositionTdRank != null &&
    features.opponentPositionTdRank >= 20
  ) {
    whyWeLike.push(
      `${features.opponent} ranks #${features.opponentPositionTdRank} vs ${features.position} TDs (${features.opponentDataLabel}).`,
    );
  }
  if (!whyWeLike.length) {
    whyWeLike.push("Balanced profile — no single dominant edge this week.");
  }

  const concerns: string[] = [];

  if (
    features.playerInjuryStatus === "questionable" ||
    features.playerInjuryStatus === "doubtful" ||
    features.playerInjuryStatus === "out" ||
    features.playerInjuryStatus === "injured_reserve"
  ) {
    const label =
      features.playerInjuryStatus === "questionable"
        ? "Questionable — monitor availability before lock"
        : features.playerInjuryStatus === "doubtful"
          ? "Doubtful — elevated risk of sitting"
          : "Ruled out / IR — not a viable pick";
    concerns.push(label);
  }

  for (const c of negatives.slice(0, 3)) {
    if (c.key === "injury" && concerns.some((x) => /questionable|doubtful|ruled out/i.test(x))) {
      continue;
    }
    concerns.push(formatContributionBullet(features, c, model));
  }
  if (
    features.opponentPositionTdRank != null &&
    features.opponentPositionTdRank <= 10 &&
    concerns.length < 3
  ) {
    concerns.push(
      `Tough matchup: ${features.opponent} ranks #${features.opponentPositionTdRank} vs ${features.position} TDs.`,
    );
  }
  if (!concerns.length) {
    concerns.push("No major usage or matchup red flags in the model this week.");
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
      // inside5TeamShare is a capped estimate, so several stars printed the
      // identical "85%". Lead with the measured red-zone workload instead.
      if (features.redZoneTouchesPerGame != null && features.redZoneTouchesPerGame > 0) {
        return `${features.redZoneTouchesPerGame.toFixed(1)} red-zone touches per game (${Math.round(model.goalLinePercentile * 100)}th pct goal-line).`;
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
    case "injury":
      return c.detail;
    default:
      return c.detail;
  }
}
