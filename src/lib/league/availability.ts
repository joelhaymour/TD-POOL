import type { InjuryStatus, LeagueMember, Pick, PlayerAvailability } from "@/lib/types";

/** Availability with no league context — injury only. */
export function availabilityFromInjury(status: InjuryStatus): PlayerAvailability {
  if (status === "out" || status === "injured_reserve") return "injured";
  if (status === "questionable" || status === "doubtful") return "questionable";
  return "available";
}

/**
 * A player is taken in this league only when an *active* member of *this*
 * league picked them this week. player_week_data is shared across every
 * league, so a stored "taken" or "locked" is never trusted.
 */
export function takenByActiveMembers(
  picks: Pick[],
  activeMembers: LeagueMember[],
): Map<string, string> {
  const active = new Map(activeMembers.map((m) => [m.id, m.display_name]));
  const taken = new Map<string, string>();
  for (const pick of picks) {
    const name = active.get(pick.member_id);
    if (name) taken.set(pick.player_id, name);
  }
  return taken;
}

export function availabilityForLeague(args: {
  takenHere: boolean;
  stored: PlayerAvailability;
  injury: InjuryStatus;
  gameStarted: boolean;
  lockStartedGames: boolean;
}): PlayerAvailability {
  if (args.takenHere) return "taken";
  if (args.lockStartedGames && args.gameStarted) return "locked";
  if (args.stored === "taken" || args.stored === "locked") {
    return availabilityFromInjury(args.injury);
  }
  return args.stored;
}
