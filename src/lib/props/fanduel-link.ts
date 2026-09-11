import type { ParlayLeg } from "@/lib/types";

export type FanduelLinkResult = {
  /** null when no leg has FanDuel ids. */
  url: string | null;
  matched: ParlayLeg[];
  /** Legs that cannot be prefilled (no FanDuel ids at snapshot time). */
  unmatched: ParlayLeg[];
};

/**
 * Build a FanDuel add-to-betslip URL for a set of legs.
 *
 * FanDuel's universal-link format accepts one selection as
 * `?marketId=&selectionId=` and multiple as indexed arrays
 * (`marketId[0]=…&selectionId[0]=…`). On phones with the FanDuel app
 * installed the link opens the app with the slip prefilled; odds shown there
 * are FanDuel's live prices, which may differ from the snapshot.
 */
export function buildFanduelParlayUrl(legs: ParlayLeg[]): FanduelLinkResult {
  const matched = legs.filter((l) => l.fd_market_id && l.fd_selection_id);
  const unmatched = legs.filter((l) => !l.fd_market_id || !l.fd_selection_id);
  if (matched.length === 0) return { url: null, matched, unmatched };

  const base = "https://sportsbook.fanduel.com/addToBetslip";
  if (matched.length === 1) {
    const leg = matched[0]!;
    return {
      url: `${base}?marketId=${leg.fd_market_id}&selectionId=${leg.fd_selection_id}`,
      matched,
      unmatched,
    };
  }

  const params = matched
    .map(
      (leg, i) =>
        `marketId[${i}]=${leg.fd_market_id}&selectionId[${i}]=${leg.fd_selection_id}`,
    )
    .join("&");
  return { url: `${base}?${params}`, matched, unmatched };
}
