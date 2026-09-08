import { currentSeasonWeight, priorSeasonWeight } from "@/lib/model/weights";
import { weightedAverage } from "@/lib/model/math";

/** Blend prior-season and current-season rates for early weeks. */
export function blendSeasonRates(args: {
  week: number;
  prior: number | null | undefined;
  current: number | null | undefined;
}): { value: number | null; priorWeight: number; currentWeight: number; label: string } {
  const pw = priorSeasonWeight(args.week);
  const cw = currentSeasonWeight(args.week);
  const prior = args.prior;
  const current = args.current;

  if (prior == null && current == null) {
    return { value: null, priorWeight: pw, currentWeight: cw, label: "No usage sample" };
  }
  if (prior == null) {
    return {
      value: current ?? null,
      priorWeight: 0,
      currentWeight: 1,
      label: "Current-season only",
    };
  }
  if (current == null || cw <= 0) {
    return {
      value: prior,
      priorWeight: 1,
      currentWeight: 0,
      label: "Prior-season baseline",
    };
  }

  const value = weightedAverage([
    { value: prior, weight: pw },
    { value: current, weight: cw },
  ]);

  return {
    value,
    priorWeight: pw,
    currentWeight: cw,
    label:
      pw >= 0.99
        ? "Prior-season baseline"
        : pw > 0
          ? `Blended (${Math.round(pw * 100)}% prior / ${Math.round(cw * 100)}% current)`
          : "Current-season",
  };
}
