import {
  americanToDecimal,
  impliedProbabilityFromAmerican,
} from "@/lib/utils/odds";

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/** Percentile rank of value within sample (0–1). Ties get mid-rank. */
export function percentileRank(value: number, sample: number[]): number {
  if (!sample.length) return 0.5;
  const sorted = [...sample].sort((a, b) => a - b);
  let below = 0;
  let equal = 0;
  for (const x of sorted) {
    if (x < value) below += 1;
    else if (x === value) equal += 1;
  }
  return (below + equal * 0.5) / sorted.length;
}

/**
 * Team implied points from total + spread.
 * Convention: spread is from the home team's perspective (negative = home favored).
 * Home implied = (total - spread) / 2
 * Away implied = (total + spread) / 2
 */
export function teamImpliedPoints(args: {
  total: number | null | undefined;
  spread: number | null | undefined;
  teamIsHome: boolean;
}): number | null {
  if (args.total == null || args.spread == null) return null;
  if (!Number.isFinite(args.total) || !Number.isFinite(args.spread)) return null;
  const home = (args.total - args.spread) / 2;
  const away = (args.total + args.spread) / 2;
  return args.teamIsHome ? home : away;
}

/** Soft vig reduction when multiple books exist (average of raw vs reciprocal-normalized). */
export function consensusImpliedFromAmericans(americans: number[]): {
  american: number;
  decimal: number;
  implied: number;
  books: number;
} | null {
  const valid = americans.filter((a) => Number.isFinite(a) && a !== 0);
  if (!valid.length) return null;

  const rawImplied = valid.map((a) => impliedProbabilityFromAmerican(a));
  const avgRaw =
    rawImplied.reduce((s, x) => s + x, 0) / Math.max(1, rawImplied.length);

  // Multiplicative normalization toward a fair book when we only have Yes prices.
  // Without No prices we cannot remove vig perfectly — shrink slightly toward 0.
  const vigHaircut = valid.length >= 3 ? 0.04 : valid.length === 2 ? 0.025 : 0.015;
  const implied = clamp01(avgRaw * (1 - vigHaircut));

  const decimals = valid.map((a) => americanToDecimal(a)).sort((a, b) => a - b);
  const medianDecimal = decimals[Math.floor(decimals.length / 2)]!;
  const avgAmerican = Math.round(
    valid.reduce((s, a) => s + a, 0) / valid.length,
  );

  return {
    american: avgAmerican,
    decimal: Number(medianDecimal.toFixed(4)),
    implied: Number(implied.toFixed(4)),
    books: valid.length,
  };
}

export function weightedAverage(
  values: Array<{ value: number; weight: number }>,
): number | null {
  let num = 0;
  let den = 0;
  for (const row of values) {
    if (!Number.isFinite(row.value) || !Number.isFinite(row.weight) || row.weight <= 0) {
      continue;
    }
    num += row.value * row.weight;
    den += row.weight;
  }
  if (den <= 0) return null;
  return num / den;
}

/** Recency weights for last N games (most recent first). */
export function recencyWeights(n: number): number[] {
  const weights: number[] = [];
  for (let i = 0; i < n; i += 1) {
    weights.push(Math.pow(0.85, i));
  }
  return weights;
}
