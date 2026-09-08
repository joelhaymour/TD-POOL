import type {
  FactorContribution,
  PlayerWeekFeatures,
  TdPoolModelOutput,
} from "@/lib/model/features";
import { clamp, clamp01, percentileRank } from "@/lib/model/math";
import { percentileLabel } from "@/lib/utils/ordinal";
import { percentileToStars } from "@/lib/model/stars";
import { TD_POOL_MODEL_VERSION } from "@/lib/model/version";
import {
  TD_MODEL_RATE_STRENGTH,
  TD_POOL_PROBABILITY_BOUNDS,
} from "@/lib/model/weights";

/** P(at least one TD) for a Poisson process with the given per-game rate. */
function poissonAtLeastOne(rate: number): number {
  return 1 - Math.exp(-Math.max(0, rate));
}

/** League-average touchdowns per game for a rostered player at each position. */
const POSITION_TD_RATE_PRIOR: Record<string, number> = {
  RB: 0.42,
  WR: 0.3,
  TE: 0.24,
  QB: 0.16,
};

/**
 * Games of prior weight mixed into the observed rate. Heavy on purpose: a
 * reserve with two scores in two games is the loudest noise on the board, and
 * a lighter prior floated several of them into the top ten.
 */
const SCORING_PRIOR_WEIGHT = 6;

/**
 * Expected touchdowns per game from scoring history, shrunk toward the position
 * prior by sample size. A back with 4 scores in 5 games is not a 0.8/game back.
 */
function baseTouchdownRate(features: PlayerWeekFeatures): number {
  const games = Math.max(0, features.scoringSampleGames);
  const tds = Math.max(0, features.touchdownsInSample);
  const prior = POSITION_TD_RATE_PRIOR[features.position] ?? 0.25;

  const depth =
    features.depthOrder == null
      ? 1
      : features.depthOrder <= 1
        ? 1.08
        : features.depthOrder === 2
          ? 0.95
          : 0.75;

  return (
    ((tds + SCORING_PRIOR_WEIGHT * prior) / (games + SCORING_PRIOR_WEIGHT)) *
    depth
  );
}

/** Share of red-zone touches that become touchdowns, by position. */
const RED_ZONE_CONVERSION: Record<string, number> = {
  RB: 0.17,
  WR: 0.2,
  TE: 0.2,
  QB: 0.15,
};

/**
 * Second, independent estimate of expected touchdowns built from red-zone
 * workload rather than past scoring. Blending the two keeps a back who scored
 * on a light workload from being credited with a role he does not have, and
 * keeps a heavy red-zone role visible before the touchdowns arrive.
 */
function opportunityTouchdownRate(
  features: PlayerWeekFeatures,
): number | null {
  const rz = features.redZoneTouchesPerGame;
  if (rz == null || rz <= 0) return null;
  return rz * (RED_ZONE_CONVERSION[features.position] ?? 0.18);
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

  // QBs score on designed runs and sneaks, so weight short-yardage rushing and
  // ignore the target-based terms entirely.
  if (f.position === "QB") {
    return inside5 * 0.45 + inside10 * 0.22 + rz * 0.15 + share5 * 0.3;
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

  // Rates are TDs allowed per game (not 0–1). Rank 1 = stingiest, 32 = softest.
  if (f.position === "RB") {
    const rushPart = rush != null ? clamp01(rush / 1.15) : 0.5;
    const rzPart = rz != null ? clamp01(rz / 2.4) : 0.5;
    const rankPart = rank != null ? clamp01((rank - 1) / 31) : 0.5;
    return rushPart * 0.45 + rzPart * 0.35 + rankPart * 0.2;
  }

  const recPart = rec != null ? clamp01(rec / 2.0) : 0.5;
  const rzPart = rz != null ? clamp01(rz / 2.4) : 0.5;
  const rankPart = rank != null ? clamp01((rank - 1) / 31) : 0.5;
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
type PeerSamples = { gl: number[]; match: number[]; usage: number[] };

/**
 * Peer distributions are identical for every player of a position, so cache
 * them per cohort. Recomputing inline made a full board O(n²).
 */
const peerSampleCache = new WeakMap<
  PlayerWeekFeatures[],
  Map<string, PeerSamples>
>();

function getPeerSamples(
  cohort: PlayerWeekFeatures[],
  position: string,
): PeerSamples {
  let byPosition = peerSampleCache.get(cohort);
  if (!byPosition) {
    byPosition = new Map();
    peerSampleCache.set(cohort, byPosition);
  }

  const cached = byPosition.get(position);
  if (cached) return cached;

  const samePos = cohort.filter((c) => c.position === position);
  const peer = samePos.length >= 8 ? samePos : cohort;
  const samples: PeerSamples = {
    gl: peer.map(goalLineRawScore),
    match: peer.map(matchupRawScore),
    usage: peer.map(usageRawScore),
  };
  byPosition.set(position, samples);
  return samples;
}

export function computeTdPoolFromFeatures(
  features: PlayerWeekFeatures,
  cohort: PlayerWeekFeatures[],
): TdPoolModelOutput {
  const glRaw = goalLineRawScore(features);
  const matchRaw = matchupRawScore(features);
  const usageRaw = usageRawScore(features);
  const envRaw = scoringEnvScore(features);
  const inj = injuryFactor(features);
  const wx = weatherFactor(features);
  const proj = features.externalProjectionScore;

  const samples = getPeerSamples(cohort, features.position);

  const goalLinePercentile = percentileRank(glRaw, samples.gl);
  const matchupPercentile = percentileRank(matchRaw, samples.match);
  const usagePercentile = percentileRank(usageRaw, samples.usage);

  // The model is market-free: it ranks on measured usage, matchup, and
  // environment. Anchoring to a sportsbook line we do not have meant anchoring
  // to a synthetic number we generated ourselves.
  //
  // Factors scale an expected-touchdowns rate rather than adding probability
  // points, then a Poisson conversion turns the rate into P(scores at least
  // once). Additive nudges on a probability saturate — every starter pinned to
  // the ceiling — because they ignore how little headroom is left near 1.
  // Ability comes from two independent estimates. Goal-line and usage then only
  // nudge, because multiplying a scoring rate by percentiles that measure the
  // same scoring ability double-counts it and pinned the top of the board to
  // the ceiling: Adams, Henry and Jacobs all read 68% with 4, 2 and 1 star
  // matchups.
  const historyRate = baseTouchdownRate(features);
  const opportunityRate = opportunityTouchdownRate(features);
  const baseRate =
    opportunityRate == null
      ? historyRate
      : historyRate * 0.6 + opportunityRate * 0.4;

  const contributions: FactorContribution[] = [];
  let rate = baseRate;

  const applyFactor = (
    key: string,
    label: string,
    factorScore: number,
    strength: number,
    detail: string,
    center = 0.5,
  ) => {
    const multiplier = Math.exp((factorScore - center) * strength);
    const before = poissonAtLeastOne(rate);
    rate *= multiplier;
    contributions.push({
      key,
      label,
      // Reported as probability points so the explanation layer is unchanged.
      delta: Number((poissonAtLeastOne(rate) - before).toFixed(4)),
      factorScore: Number(factorScore.toFixed(4)),
      detail,
    });
  };

  contributions.push({
    key: "baseline",
    label: "Scoring rate baseline",
    delta: 0,
    factorScore: Number(baseRate.toFixed(4)),
    detail:
      opportunityRate == null
        ? `${baseRate.toFixed(2)} expected TD/game from role and recent scoring`
        : `${baseRate.toFixed(2)} expected TD/game — ${historyRate.toFixed(2)} from scoring history, ${opportunityRate.toFixed(2)} from red-zone workload`,
  });

  applyFactor(
    "goalLine",
    "Goal-line / red-zone",
    goalLinePercentile,
    TD_MODEL_RATE_STRENGTH.goalLine,
    `GL score ${glRaw.toFixed(2)} · ${percentileLabel(goalLinePercentile)} pct vs ${features.position}s`,
  );
  applyFactor(
    "recentUsage",
    "Recent usage / role",
    usagePercentile,
    TD_MODEL_RATE_STRENGTH.recentUsage,
    `Usage ${percentileLabel(usagePercentile)} pct · trend ${features.recentTouchTrend}`,
  );
  applyFactor(
    "matchup",
    "Opponent matchup",
    matchupPercentile,
    TD_MODEL_RATE_STRENGTH.matchup,
    `${features.opponentDataLabel}: ${percentileLabel(matchupPercentile)} pct matchup`,
  );
  applyFactor(
    "scoringEnvironment",
    "Scoring environment",
    envRaw,
    TD_MODEL_RATE_STRENGTH.scoringEnvironment,
    features.teamImpliedPoints != null
      ? `Team implied ${features.teamImpliedPoints.toFixed(1)} pts`
      : "Implied points unavailable",
  );

  if (proj != null) {
    applyFactor(
      "projection",
      "External projection",
      clamp01(proj),
      TD_MODEL_RATE_STRENGTH.projection,
      "Secondary projection signal",
    );
  }

  // deltaScale < 0 = player injury risk (always a penalty).
  // deltaScale > 0 = teammate absence boost.
  const injuryMultiplier =
    inj.deltaScale < 0
      ? Math.max(0.05, 1 + inj.deltaScale * 0.9)
      : 1 + inj.deltaScale * 0.25 * Math.max(0, inj.score - 0.55);
  const injuryBefore = poissonAtLeastOne(rate);
  rate *= injuryMultiplier;
  const injuryDelta = poissonAtLeastOne(rate) - injuryBefore;
  contributions.push({
    key: "injury",
    label: "Injury / depth context",
    delta: Number(injuryDelta.toFixed(4)),
    factorScore: inj.score,
    detail: inj.detail,
  });

  const weatherBefore = poissonAtLeastOne(rate);
  rate *= Math.exp((wx.score - 0.55) * TD_MODEL_RATE_STRENGTH.weather);
  const weatherDelta = poissonAtLeastOne(rate) - weatherBefore;
  contributions.push({
    key: "weather",
    label: "Weather / game context",
    delta: Number(weatherDelta.toFixed(4)),
    factorScore: wx.score,
    detail: wx.detail,
  });

  const tdPoolProbability = clamp(
    poissonAtLeastOne(rate),
    TD_POOL_PROBABILITY_BOUNDS.min,
    TD_POOL_PROBABILITY_BOUNDS.max,
  );

  return {
    tdPoolProbability: Number(tdPoolProbability.toFixed(4)),
    marketProbability: null,
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
