import { clamp01 } from "@/lib/model/math";

/**
 * Convert a position-aware percentile (0–1) into 1–5 stars.
 * Thresholds from product spec.
 */
export function percentileToStars(percentile: number): number {
  const p = clamp01(percentile);
  if (p >= 0.95) return 5;
  if (p >= 0.8) return 4;
  if (p >= 0.6) return 3;
  if (p >= 0.35) return 2;
  return 1;
}
