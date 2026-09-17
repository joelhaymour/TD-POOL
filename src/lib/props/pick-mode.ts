import type { League, LeagueMember, ParlayLeg } from "@/lib/types";

/** How many legs one member may put on a slip; open slips have no limit. */
export function maxLegsPerMember(league: Pick<League, "pick_mode">): number {
  return league.pick_mode === "one_each" ? 1 : Number.POSITIVE_INFINITY;
}

/**
 * A one-pick-each slip is complete once every active member has a leg on it.
 * An open slip is never "complete" on its own — someone locks it in.
 */
export function slipComplete(
  league: Pick<League, "pick_mode">,
  legs: Pick<ParlayLeg, "member_id">[],
  members: Pick<LeagueMember, "id" | "active">[],
): boolean {
  if (league.pick_mode !== "one_each") return false;
  const active = members.filter((m) => m.active);
  if (active.length === 0) return false;
  const picked = new Set(legs.map((l) => l.member_id));
  return active.every((m) => picked.has(m.id));
}
