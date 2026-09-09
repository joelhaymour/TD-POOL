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

export function isValidAmericanOdds(american: number | null | undefined): american is number {
  return american != null && Number.isFinite(american) && american !== 0;
}

/** Decimal odds must be greater than 1 (even money is 2.00). */
export function isValidDecimalOdds(decimal: number | null | undefined): decimal is number {
  return decimal != null && Number.isFinite(decimal) && decimal > 1;
}

/** Stored 0 means "no quote", not even-money. */
export function decimalOddsForLeg(
  consensusDecimal: number | null | undefined,
  americanAtSelection: number | null | undefined,
): number | null {
  if (isValidDecimalOdds(consensusDecimal)) return consensusDecimal;
  if (!isValidAmericanOdds(americanAtSelection)) return null;
  return americanToDecimal(americanAtSelection);
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

/**
 * Combined parlay price, or null when any leg is unpriced.
 * Callers must not invent a number from a partial ticket.
 */
export function tryCombineParlayDecimal(
  odds: Array<number | null | undefined>,
): number | null {
  if (odds.length === 0) return null;
  if (!odds.every(isValidDecimalOdds)) return null;
  return combineParlayDecimal(odds);
}

export function parlayCombinedFields(
  decimalLegs: Array<number | null>,
  stake: number,
  bettingMode: BettingMode,
): {
  combined_decimal: number | null;
  combined_american: number | null;
  estimated_payout: number | null;
  estimated_profit: number | null;
} {
  const combined = tryCombineParlayDecimal(decimalLegs);
  if (combined == null) {
    return {
      combined_decimal: null,
      combined_american: null,
      estimated_payout: null,
      estimated_profit: null,
    };
  }
  const money =
    bettingMode !== "none" ? estimatePayout(stake, combined) : null;
  return {
    combined_decimal: Number(combined.toFixed(4)),
    combined_american: decimalToAmerican(combined),
    estimated_payout: money ? Number(money.payout.toFixed(2)) : null,
    estimated_profit: money ? Number(money.profit.toFixed(2)) : null,
  };
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
