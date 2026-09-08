import type {
  FactorContribution,
  PlayerWeekFeatures,
  TdPoolModelOutput,
} from "@/lib/model/features";
import { clamp, clamp01, percentileRank } from "@/lib/model/math";
import { percentileToStars } from "@/lib/model/stars";
import { TD_POOL_MODEL_VERSION } from "@/lib/model/version";
import {
  TD_MODEL_ADJUSTMENT_SCALE,
  TD_POOL_PROBABILITY_BOUNDS,
} from "@/lib/model/weights";

function neutralBaselineFromRole(features: PlayerWeekFeatures): number {
  const tdRate =
    features.touchdownsLast5 > 0
      ? features.touchdownsLast5 / 5
      : features.touchdownsLast3 > 0
        ? features.touchdownsLast3 / 3
        : 0;
  // Convert recent TD rate into a soft anytime baseline, then blend role prior.
  const fromTds = 1 - Math.exp(-Math.max(0, tdRate) * 1.25);
  let role = 0.16;
  switch (features.position) {
    case "RB":
      role = 0.24;
      break;
    case "WR":
      role = 0.16;
      break;
    case "TE":
      role = 0.12;
      break;
    case "QB":
      role = 0.1;
      break;
    default:
      break;
  }
  // Depth chart: starters get a bump; deep bench stays low.
  const depth =
    features.depthOrder == null
      ? 0
      : features.depthOrder <= 1
        ? 0.06
        : features.depthOrder === 2
          ? 0.02
          : -0.04;
  return clamp01(Math.max(fromTds, role * 0.55 + fromTds * 0.45) + depth);
}

function goalLineRawScore(f: PlayerWeekFeatures): number {
  const inside5 = f.inside5TouchesPerGame ?? 0;
  const inside10 = f.inside10TouchesPerGame ?? 0;
  const rz = f.redZoneTouchesPerGame ?? 0;
  const share5 = f.inside5TeamShare ?? 0;
  const share10 = f.inside10TeamShare ?? 0;

  if (f.position === "RB") {
    return (
      inside5 * 0.35 +
      inside10 * 0.2 +
      rz * 0.12 +
      share5 * 0.45 +
      share10 * 0.25
    );
  }
  // WR/TE — emphasize RZ/end-zone targets
  const ez = f.redZoneTargetsPerGame ?? rz * 0.7;
  return ez * 0.35 + rz * 0.2 + share5 * 0.25 + share10 * 0.15 + inside10 * 0.1;
}

function matchupRawScore(f: PlayerWeekFeatures): number {
  const rush = f.opponentRushTdAllowedRate;
  const rec = f.opponentRecTdAllowedRate;
  const rz = f.opponentRzTdAllowedRate;
  const rank = f.opponentPositionTdRank;

  if (f.position === "RB") {
    const rushPart = rush != null ? clamp01(rush / 0.35) : 0.5;
    const rzPart = rz != null ? clamp01(rz / 0.55) : 0.5;
    const rankPart =
      rank != null ? clamp01((32 - rank) / 31) : 0.5;
    return rushPart * 0.45 + rzPart * 0.35 + rankPart * 0.2;
  }

  const recPart = rec != null ? clamp01(rec / 0.4) : 0.5;
  const rzPart = rz != null ? clamp01(rz / 0.55) : 0.5;
  const rankPart = rank != null ? clamp01((32 - rank) / 31) : 0.5;
  return recPart * 0.45 + rzPart * 0.35 + rankPart * 0.2;
}

function usageRawScore(f: PlayerWeekFeatures): number {
  const snap = f.snapRate ?? 0;
  const touches =
    (f.carriesPerGame ?? 0) * (f.position === "RB" ? 1 : 0.35) +
    (f.targetsPerGame ?? 0) * (f.position === "RB" ? 0.35 : 1);
  const share =
    f.position === "RB" ? (f.touchShare ?? 0) : (f.targetShare ?? 0);
  const trendBoost =
    f.recentTouchTrend === "up"
      ? 0.08
      : f.recentTouchTrend === "down"
        ? -0.06
        : 0;
  return clamp01(snap * 0.35 + clamp01(touches / 18) * 0.35 + share * 0.3 + trendBoost);
}

function scoringEnvScore(f: PlayerWeekFeatures): number {
  const implied = f.teamImpliedPoints;
  if (implied == null) return 0.5;
  // Map ~14–32 implied points onto 0–1
  return clamp01((implied - 14) / 18);
}

function injuryFactor(f: PlayerWeekFeatures): { score: number; deltaScale: number; detail: string } {
  switch (f.playerInjuryStatus) {
    case "out":
    case "injured_reserve":
      return { score: 0.05, deltaScale: -1, detail: "Player ruled out / IR" };
    case "doubtful":
      return { score: 0.2, deltaScale: -0.85, detail: "Doubtful — snap risk" };
    case "questionable":
      return { score: 0.45, deltaScale: -0.45, detail: "Questionable tag" };
    default:
      break;
  }

  // Teammate absences can boost opportunity
  const boosts = f.teammateInjuryContext.length;
  if (boosts > 0) {
    return {
      score: clamp01(0.55 + boosts * 0.12),
      deltaScale: 0.35,
      detail: f.teammateInjuryContext.slice(0, 2).join("; "),
    };
  }
  return { score: 0.7, deltaScale: 0, detail: "No material injury drag" };
}

function weatherFactor(f: PlayerWeekFeatures): { score: number; detail: string } {
  if (f.indoor) return { score: 0.55, detail: "Indoor — weather neutralized" };
  switch (f.weatherSeverity) {
    case "severe":
      return {
        score: f.position === "RB" ? 0.48 : 0.28,
        detail: "Severe weather — passing TD equity suppressed",
      };
    case "moderate":
      return {
        score: f.position === "RB" ? 0.52 : 0.4,
        detail: "Moderate weather risk",
      };
    case "mild":
      return { score: 0.5, detail: "Mild weather — small effect" };
    default:
      return { score: 0.55, detail: "Weather not a material factor" };
  }
}

/**
 * Market-anchored TD Pool probability with explainable factor contributions.
 * Rank by `tdPoolProbability` descending.
 */
export function computeTdPoolFromFeatures(
  features: PlayerWeekFeatures,
  cohort: PlayerWeekFeatures[],
): TdPoolModelOutput {
  const samePos = cohort.filter((c) => c.position === features.position);
  const peer = samePos.length >= 8 ? samePos : cohort;

  const glRaw = goalLineRawScore(features);
  const matchRaw = matchupRawScore(features);
  const usageRaw = usageRawScore(features);
  const envRaw = scoringEnvScore(features);
  const inj = injuryFactor(features);
  const wx = weatherFactor(features);
  const proj = features.externalProjectionScore;

  const glSample = peer.map(goalLineRawScore);
  const matchSample = peer.map(matchupRawScore);
  const usageSample = peer.map(usageRawScore);

  const goalLinePercentile = percentileRank(glRaw, glSample);
  const matchupPercentile = percentileRank(matchRaw, matchSample);
  const usagePercentile = percentileRank(usageRaw, usageSample);

  const market = features.marketConsensusProbability;
  const baseline =
    market != null && market > 0
      ? market
      : neutralBaselineFromRole(features) * (0.7 + usagePercentile * 0.6);

  const contributions: FactorContribution[] = [];

  const pushAdj = (
    key: string,
    label: string,
    factorScore: number,
    scale: number,
    detail: string,
    center = 0.5,
  ) => {
    const delta = (factorScore - center) * scale;
    contributions.push({
      key,
      label,
      delta: Number(delta.toFixed(4)),
      factorScore: Number(factorScore.toFixed(4)),
      detail,
    });
    return delta;
  };

  let total = baseline;
  contributions.push({
    key: "market",
    label: "Market baseline",
    delta: 0,
    factorScore: market ?? baseline,
    detail:
      market != null
        ? `Consensus anytime TD implied ${(market * 100).toFixed(1)}%`
        : "Market unavailable — role baseline used",
  });

  total += pushAdj(
    "goalLine",
    "Goal-line / red-zone",
    goalLinePercentile,
    TD_MODEL_ADJUSTMENT_SCALE.goalLine,
    `GL score ${glRaw.toFixed(2)} · ${Math.round(goalLinePercentile * 100)}th pct vs ${features.position}s`,
  );
  total += pushAdj(
    "scoringEnvironment",
    "Scoring environment",
    envRaw,
    TD_MODEL_ADJUSTMENT_SCALE.scoringEnvironment,
    features.teamImpliedPoints != null
      ? `Team implied ${features.teamImpliedPoints.toFixed(1)} pts`
      : "Implied points unavailable",
  );
  total += pushAdj(
    "recentUsage",
    "Recent usage / role",
    usagePercentile,
    TD_MODEL_ADJUSTMENT_SCALE.recentUsage,
    `Usage ${Math.round(usagePercentile * 100)}th pct · trend ${features.recentTouchTrend}`,
  );
  total += pushAdj(
    "matchup",
    "Opponent matchup",
    matchupPercentile,
    TD_MODEL_ADJUSTMENT_SCALE.matchup,
    `${features.opponentDataLabel}: ${Math.round(matchupPercentile * 100)}th pct matchup`,
  );

  if (proj != null) {
    total += pushAdj(
      "projection",
      "External projection",
      clamp01(proj),
      TD_MODEL_ADJUSTMENT_SCALE.projection,
      "Secondary projection signal",
    );
  }

  const injuryDelta =
    inj.deltaScale *
    TD_MODEL_ADJUSTMENT_SCALE.injury *
    (inj.score >= 0.55 ? inj.score - 0.55 : inj.score - 0.7);
  contributions.push({
    key: "injury",
    label: "Injury / depth context",
    delta: Number(injuryDelta.toFixed(4)),
    factorScore: inj.score,
    detail: inj.detail,
  });
  total += injuryDelta;

  const weatherDelta =
    (wx.score - 0.55) * TD_MODEL_ADJUSTMENT_SCALE.weather;
  contributions.push({
    key: "weather",
    label: "Weather / game context",
    delta: Number(weatherDelta.toFixed(4)),
    factorScore: wx.score,
    detail: wx.detail,
  });
  total += weatherDelta;

  const tdPoolProbability = clamp(
    total,
    TD_POOL_PROBABILITY_BOUNDS.min,
    TD_POOL_PROBABILITY_BOUNDS.max,
  );

  return {
    tdPoolProbability: Number(tdPoolProbability.toFixed(4)),
    marketProbability: market,
    goalLineScore: Number(glRaw.toFixed(4)),
    goalLinePercentile: Number(goalLinePercentile.toFixed(4)),
    goalLineStars: percentileToStars(goalLinePercentile),
    matchupScore: Number(matchRaw.toFixed(4)),
    matchupPercentile: Number(matchupPercentile.toFixed(4)),
    matchupStars: percentileToStars(matchupPercentile),
    recentUsageScore: Number(usageRaw.toFixed(4)),
    injuryAdjustment: Number(injuryDelta.toFixed(4)),
    weatherAdjustment: Number(weatherDelta.toFixed(4)),
    scoringEnvironmentScore: Number(envRaw.toFixed(4)),
    projectionScore: proj,
    contributions,
    dataCompleteness: features.dataCompleteness,
    limitedData: features.limitedData,
    modelVersion: TD_POOL_MODEL_VERSION,
  };
}
