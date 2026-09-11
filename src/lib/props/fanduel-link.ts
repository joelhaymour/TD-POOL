import type { ParlayLeg } from "@/lib/types";

/**
 * States where FanDuel Sportsbook takes bets. Each has its own subdomain;
 * a link without one lands on a state picker first, which is where
 * multi-leg selections were getting dropped.
 */
export const FANDUEL_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "az", name: "Arizona" },
  { code: "co", name: "Colorado" },
  { code: "ct", name: "Connecticut" },
  { code: "il", name: "Illinois" },
  { code: "in", name: "Indiana" },
  { code: "ia", name: "Iowa" },
  { code: "ks", name: "Kansas" },
  { code: "ky", name: "Kentucky" },
  { code: "la", name: "Louisiana" },
  { code: "md", name: "Maryland" },
  { code: "ma", name: "Massachusetts" },
  { code: "mi", name: "Michigan" },
  { code: "mo", name: "Missouri" },
  { code: "nj", name: "New Jersey" },
  { code: "ny", name: "New York" },
  { code: "nc", name: "North Carolina" },
  { code: "oh", name: "Ohio" },
  { code: "pa", name: "Pennsylvania" },
  { code: "tn", name: "Tennessee" },
  { code: "vt", name: "Vermont" },
  { code: "va", name: "Virginia" },
  { code: "wv", name: "West Virginia" },
  { code: "wy", name: "Wyoming" },
];

type FdLeg = Pick<ParlayLeg, "fd_market_id" | "fd_selection_id">;

export type FanduelLinkResult<T extends FdLeg> = {
  /** null when no leg has FanDuel ids. */
  url: string | null;
  matched: T[];
  /** Legs that cannot be prefilled (no FanDuel ids at snapshot time). */
  unmatched: T[];
};

export function fanduelStateName(code: string | null | undefined): string | null {
  return FANDUEL_STATES.find((s) => s.code === code?.toLowerCase())?.name ?? null;
}

function betslipBase(state: string | null | undefined): string {
  const code = state?.toLowerCase();
  const known = code && FANDUEL_STATES.some((s) => s.code === code);
  return known
    ? `https://${code}.sportsbook.fanduel.com/addToBetslip`
    : "https://sportsbook.fanduel.com/addToBetslip";
}

/** One selection — the format FanDuel documents and The Odds API returns. */
export function buildFanduelLegUrl(
  leg: FdLeg,
  state?: string | null,
): string | null {
  if (!leg.fd_market_id || !leg.fd_selection_id) return null;
  return `${betslipBase(state)}?marketId=${leg.fd_market_id}&selectionId=${leg.fd_selection_id}`;
}

/**
 * Build a FanDuel add-to-betslip URL for a set of legs, as indexed arrays
 * (`marketId[0]=…&selectionId[0]=…`). On a phone with the FanDuel app the
 * link opens the app with the slip prefilled; FanDuel shows its live prices,
 * which may differ from the snapshot.
 */
export function buildFanduelParlayUrl<T extends FdLeg>(
  legs: T[],
  state?: string | null,
): FanduelLinkResult<T> {
  const matched = legs.filter((l) => l.fd_market_id && l.fd_selection_id);
  const unmatched = legs.filter((l) => !l.fd_market_id || !l.fd_selection_id);
  if (matched.length === 0) return { url: null, matched, unmatched };
  if (matched.length === 1) {
    return { url: buildFanduelLegUrl(matched[0]!, state), matched, unmatched };
  }
  const params = matched
    .map(
      (leg, i) =>
        `marketId[${i}]=${leg.fd_market_id}&selectionId[${i}]=${leg.fd_selection_id}`,
    )
    .join("&");
  return { url: `${betslipBase(state)}?${params}`, matched, unmatched };
}
