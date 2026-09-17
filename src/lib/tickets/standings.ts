import { legTitle } from "@/lib/props/format";
import type { LeagueMember, ParlayWithLegs } from "@/lib/types";

export type TicketStanding = {
  memberId: string;
  name: string;
  posted: number;
  won: number;
  lost: number;
  pending: number;
  /** Money in and out across settled tickets that carried a stake. */
  staked: number;
  returned: number;
  /** The biggest price this member cashed. */
  bestHit: { odds: number; title: string } | null;
  /** How many times someone tapped "I'm riding" on this member's tickets. */
  rides: number;
};

/**
 * Members ranked by tickets cashed. A range of `week` counts only tickets
 * filed under that week; `season` counts everything. Pending tickets show
 * how much is still live but do not move the order.
 */
export function ticketStandings(
  tickets: ParlayWithLegs[],
  members: LeagueMember[],
  range: { weekId: string | null },
): TicketStanding[] {
  const table = new Map<string, TicketStanding>(
    members
      .filter((m) => m.active)
      .map((m) => [
        m.id,
        {
          memberId: m.id,
          name: m.display_name,
          posted: 0,
          won: 0,
          lost: 0,
          pending: 0,
          staked: 0,
          returned: 0,
          bestHit: null,
          rides: 0,
        },
      ]),
  );

  for (const { parlay, legs, rides } of tickets) {
    if (range.weekId && parlay.week_id !== range.weekId) continue;
    const row = parlay.created_by_member_id
      ? table.get(parlay.created_by_member_id)
      : undefined;
    if (!row) continue;
    row.posted += 1;
    row.rides += rides.length;
    if (!parlay.settled_at) {
      row.pending += 1;
      continue;
    }
    if (parlay.result === "won") {
      row.won += 1;
      const odds = parlay.book_odds;
      if (odds != null && (!row.bestHit || odds > row.bestHit.odds)) {
        row.bestHit = { odds, title: parlay.title || legTitle(legs[0]) };
      }
    } else if (parlay.result === "lost") {
      row.lost += 1;
    }
    if (parlay.stake != null) {
      row.staked += parlay.stake;
      row.returned += parlay.payout ?? 0;
    }
  }

  return [...table.values()].sort(
    (a, b) =>
      b.won - a.won ||
      b.returned - b.staked - (a.returned - a.staked) ||
      a.posted - b.posted ||
      a.name.localeCompare(b.name),
  );
}
