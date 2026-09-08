import type { BettingMode } from "@/lib/types";

/** Convert American odds to decimal odds. */
export function americanToDecimal(american: number): number {
  if (american === 0) {
    throw new Error("American odds cannot be 0");
  }
  if (american > 0) {
    return american / 100 + 1;
  }
  return 100 / Math.abs(american) + 1;
}

/** Convert decimal odds to American odds. */
export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) {
    throw new Error("Decimal odds must be greater than 1");
  }
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  }
  return Math.round(-100 / (decimal - 1));
}

/** Implied win probability from American odds (no vig removal). */
export function impliedProbabilityFromAmerican(american: number): number {
  if (american === 0) {
    throw new Error("American odds cannot be 0");
  }
  if (american > 0) {
    return 100 / (american + 100);
  }
  return Math.abs(american) / (Math.abs(american) + 100);
}

/** Format American odds for display, e.g. +150 or -110. */
export function formatAmerican(american: number | null | undefined): string {
  if (american == null || !Number.isFinite(american) || american === 0) {
    return "Unavailable";
  }
  const rounded = Math.round(american);
  if (rounded > 0) {
    return `+${rounded}`;
  }
  return String(rounded);
}

/** Format decimal odds to two decimal places. */
export function formatDecimal(decimal: number): string {
  return decimal.toFixed(2);
}

/** Product of independent decimal legs for an approximate parlay. */
export function combineParlayDecimal(odds: number[]): number {
  if (odds.length === 0) {
    return 1;
  }
  return odds.reduce((acc, odd) => {
    if (odd <= 0) {
      throw new Error("Decimal odds must be positive");
    }
    return acc * odd;
  }, 1);
}

export function estimatePayout(
  stake: number,
  combinedDecimal: number,
): { payout: number; profit: number } {
  const payout = stake * combinedDecimal;
  return {
    payout,
    profit: payout - stake,
  };
}

export interface WeeklyStakeLeagueInput {
  betting_mode: BettingMode;
  contribution_per_member: number | null;
  fixed_weekly_stake: number | null;
  member_count: number;
}

/** Weekly stake based on league betting settings. */
export function calculateWeeklyStake(league: WeeklyStakeLeagueInput): number {
  switch (league.betting_mode) {
    case "none":
      return 0;
    case "fixed":
      return league.fixed_weekly_stake ?? 0;
    case "individual":
      return (
        (league.contribution_per_member ?? 0) * Math.max(league.member_count, 0)
      );
    default: {
      const _exhaustive: never = league.betting_mode;
      return _exhaustive;
    }
  }
}

/** Format a stake/payout amount for display. */
export function formatMoney(
  amount: number,
  currency: "USD" | "CAD" = "USD",
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
