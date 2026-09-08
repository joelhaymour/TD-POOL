/**
 * Backtest scaffold: compare stored weekly probabilities vs actual TD outcomes.
 * Wire to historical player_week_data + graded picks / ESPN results.
 *
 * Run: npx --yes tsx scripts/backtest-td-pool.ts
 */

export type BacktestRow = {
  season: number;
  week: number;
  playerId: string;
  predictedProbability: number;
  actualTd: 0 | 1;
  modelVersion: string;
};

export function brierScore(rows: BacktestRow[]): number {
  if (!rows.length) return 0;
  const sum = rows.reduce((s, r) => {
    const err = r.predictedProbability - r.actualTd;
    return s + err * err;
  }, 0);
  return sum / rows.length;
}

export function logLoss(rows: BacktestRow[]): number {
  const eps = 1e-6;
  if (!rows.length) return 0;
  const sum = rows.reduce((s, r) => {
    const p = Math.min(1 - eps, Math.max(eps, r.predictedProbability));
    return s + -(r.actualTd * Math.log(p) + (1 - r.actualTd) * Math.log(1 - p));
  }, 0);
  return sum / rows.length;
}

export function calibrationBuckets(
  rows: BacktestRow[],
  width = 0.1,
): Array<{ bucket: string; n: number; avgPredicted: number; actualRate: number }> {
  const buckets = new Map<number, BacktestRow[]>();
  for (const row of rows) {
    const key = Math.floor(row.predictedProbability / width);
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, list]) => {
      const lo = key * width;
      const hi = lo + width;
      const avgPredicted =
        list.reduce((s, r) => s + r.predictedProbability, 0) / list.length;
      const actualRate =
        list.reduce((s, r) => s + r.actualTd, 0) / list.length;
      return {
        bucket: `${Math.round(lo * 100)}-${Math.round(hi * 100)}%`,
        n: list.length,
        avgPredicted: Number(avgPredicted.toFixed(4)),
        actualRate: Number(actualRate.toFixed(4)),
      };
    });
}

// Demo self-check with synthetic data
const demo: BacktestRow[] = [
  { season: 2025, week: 1, playerId: "a", predictedProbability: 0.65, actualTd: 1, modelVersion: "v1.0" },
  { season: 2025, week: 1, playerId: "b", predictedProbability: 0.62, actualTd: 0, modelVersion: "v1.0" },
  { season: 2025, week: 1, playerId: "c", predictedProbability: 0.2, actualTd: 0, modelVersion: "v1.0" },
  { season: 2025, week: 1, playerId: "d", predictedProbability: 0.18, actualTd: 1, modelVersion: "v1.0" },
];

console.log(
  JSON.stringify(
    {
      brier: brierScore(demo),
      logLoss: logLoss(demo),
      calibration: calibrationBuckets(demo),
      note: "Replace demo rows with historical PlayerWeekFeatures + actual outcomes.",
    },
    null,
    2,
  ),
);
