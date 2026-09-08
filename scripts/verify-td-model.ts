/**
 * Lightweight model unit checks (no test runner required).
 * Run: npx --yes tsx scripts/verify-td-model.ts
 */

import assert from "node:assert/strict";
import {
  clamp,
  consensusImpliedFromAmericans,
  percentileRank,
  teamImpliedPoints,
} from "../src/lib/model/math";
import { priorSeasonWeight, currentSeasonWeight } from "../src/lib/model/weights";
import { percentileToStars } from "../src/lib/model/stars";
import { computeTdPoolFromFeatures } from "../src/lib/model/compute-td-pool";
import type { PlayerWeekFeatures } from "../src/lib/model/features";
import { formatAmerican } from "../src/lib/utils/odds";
import { blendSeasonRates } from "../src/lib/model/early-season";

function baseFeatures(over: Partial<PlayerWeekFeatures> = {}): PlayerWeekFeatures {
  return {
    season: 2026,
    week: 1,
    playerId: "p1",
    externalPlayerId: "sleeper-1",
    playerName: "Test Back",
    team: "PHI",
    opponent: "NYG",
    position: "RB",
    gameId: "g1",
    kickoffAt: new Date().toISOString(),
    teamIsHome: true,
    marketConsensusProbability: 0.58,
    bestAnytimeTdOdds: -140,
    consensusAnytimeTdOdds: -138,
    marketBooks: 4,
    snapRate: 0.7,
    carriesPerGame: 18,
    targetsPerGame: 3,
    touchShare: 0.55,
    targetShare: 0.08,
    redZoneTouchesPerGame: 4,
    redZoneCarriesPerGame: 3,
    redZoneTargetsPerGame: 1,
    inside10TouchesPerGame: 2,
    inside5TouchesPerGame: 1.4,
    inside5TeamShare: 0.75,
    inside10TeamShare: 0.7,
    recentSnapTrend: "stable",
    recentTouchTrend: "up",
    recentTargetTrend: "stable",
    recentRedZoneTrend: "up",
    touchdownsLast3: 3,
    touchdownsLast5: 4,
    scoringSampleGames: 5,
    opponentDataLabel: "2025 opponent data",
    opponentRzTdAllowedRate: 0.5,
    opponentRushTdAllowedRate: 0.3,
    opponentRecTdAllowedRate: 0.25,
    opponentPositionTdRank: 28,
    opponentTdAllowedSampleGames: 17,
    spread: -3,
    gameTotal: 48.5,
    teamImpliedPoints: 25.75,
    temperatureF: 70,
    windMph: 6,
    precipProbability: 10,
    indoor: false,
    weatherSeverity: "none",
    playerInjuryStatus: "healthy",
    depthOrder: 1,
    teammateInjuryContext: [],
    opposingDefenseInjuryContext: [],
    externalProjectionScore: null,
    dataCompleteness: 0.9,
    limitedData: false,
    featureNotes: [],
    ...over,
  };
}

assert.equal(formatAmerican(0), "Unavailable");
assert.equal(formatAmerican(null), "Unavailable");
assert.equal(formatAmerican(-150), "-150");
assert.equal(formatAmerican(120), "+120");

assert.equal(teamImpliedPoints({ total: 48.5, spread: -3, teamIsHome: true }), 25.75);
assert.equal(teamImpliedPoints({ total: 48.5, spread: -3, teamIsHome: false }), 22.75);

assert.equal(priorSeasonWeight(1), 1);
assert.equal(currentSeasonWeight(1), 0);
assert.ok(priorSeasonWeight(3) > currentSeasonWeight(3));
assert.equal(priorSeasonWeight(6), 0);

const blend = blendSeasonRates({ week: 1, prior: 4, current: 1 });
assert.equal(blend.value, 4);

assert.equal(percentileToStars(0.96), 5);
assert.equal(percentileToStars(0.82), 4);
assert.equal(percentileToStars(0.2), 1);

assert.ok(percentileRank(10, [1, 5, 10, 20]) > 0.4);

const consensus = consensusImpliedFromAmericans([-150, -145, -155]);
assert.ok(consensus);
assert.ok(consensus!.implied > 0.5 && consensus!.implied < 0.7);

const strong = computeTdPoolFromFeatures(baseFeatures(), [
  baseFeatures(),
  baseFeatures({
    playerName: "Bench",
    inside5TouchesPerGame: 0.1,
    inside5TeamShare: 0.1,
    marketConsensusProbability: 0.12,
    redZoneTouchesPerGame: 0.5,
  }),
]);
const weak = computeTdPoolFromFeatures(
  baseFeatures({
    playerName: "Bench",
    inside5TouchesPerGame: 0.1,
    inside5TeamShare: 0.1,
    marketConsensusProbability: 0.12,
    redZoneTouchesPerGame: 0.5,
    teamImpliedPoints: 16,
  }),
  [
    baseFeatures(),
    baseFeatures({
      playerName: "Bench",
      inside5TouchesPerGame: 0.1,
      inside5TeamShare: 0.1,
      marketConsensusProbability: 0.12,
    }),
  ],
);

assert.ok(strong.tdPoolProbability > weak.tdPoolProbability);
assert.ok(strong.tdPoolProbability >= 0.02 && strong.tdPoolProbability <= 0.75);
assert.ok(strong.contributions.some((c) => c.key === "baseline"));
assert.equal(clamp(2, 0, 1), 1);

const ranked = [weak, strong].sort(
  (a, b) => b.tdPoolProbability - a.tdPoolProbability,
);
assert.equal(ranked[0], strong);

// Calibration guards. An elite back is a coin flip, not a certainty, and a
// deep reserve must stay low. These bounds are what the additive model broke:
// every starter saturated at the ceiling once the market anchor was removed.
assert.ok(
  strong.tdPoolProbability > 0.4 && strong.tdPoolProbability < 0.68,
  `elite RB out of range: ${strong.tdPoolProbability}`,
);
// `weak` still carries 18/game and 4 recent TDs — it is a volume back with a
// poor goal-line role, so it should land well under the elite tier but not low.
assert.ok(
  weak.tdPoolProbability < 0.45,
  `low goal-line back too high: ${weak.tdPoolProbability}`,
);

const deepReserve = computeTdPoolFromFeatures(
  baseFeatures({
    playerName: "Deep Reserve",
    position: "WR",
    depthOrder: 4,
    snapRate: 0.1,
    carriesPerGame: 0,
    targetsPerGame: 0.6,
    touchShare: 0.02,
    targetShare: 0.02,
    redZoneTouchesPerGame: 0,
    redZoneCarriesPerGame: 0,
    redZoneTargetsPerGame: 0,
    inside10TouchesPerGame: 0,
    inside5TouchesPerGame: 0,
    inside5TeamShare: 0.02,
    inside10TeamShare: 0.02,
    touchdownsLast3: 0,
    touchdownsLast5: 0,
    teamImpliedPoints: 17,
  }),
  [baseFeatures(), baseFeatures({ playerName: "Bench", inside5TouchesPerGame: 0.1 })],
);
assert.ok(
  deepReserve.tdPoolProbability < 0.18,
  `deep reserve too high: ${deepReserve.tdPoolProbability}`,
);

// An out player must never outrank a healthy one with identical usage.
const ruledOut = computeTdPoolFromFeatures(
  baseFeatures({ playerInjuryStatus: "out" }),
  [baseFeatures()],
);
assert.ok(ruledOut.tdPoolProbability < strong.tdPoolProbability * 0.4);

console.log("verify-td-model: all checks passed");
console.log(
  `  elite RB ${(strong.tdPoolProbability * 100).toFixed(1)}% · ` +
    `reserve ${(weak.tdPoolProbability * 100).toFixed(1)}% · ` +
    `deep reserve ${(deepReserve.tdPoolProbability * 100).toFixed(1)}% · ` +
    `ruled out ${(ruledOut.tdPoolProbability * 100).toFixed(1)}%`,
);
