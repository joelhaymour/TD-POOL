import { legTitle } from "@/lib/props/format";
import type { SlipPhase } from "@/lib/props/slip";
import type { ParlayLeg, ParlayResult } from "@/lib/types";

type TitleLeg = Pick<ParlayLeg, "market_key" | "player_name" | "outcome_label" | "line">;

/** "DJ Moore Over 4.5" for a single; "DJ Moore Over 4.5 + 2 more" for a parlay. */
export function autoTicketTitle(legs: TitleLeg[]): string {
  if (legs.length === 0) return "Ticket";
  const first = legTitle(legs[0]);
  if (legs.length === 1) return first;
  return `${first} + ${legs.length - 1} more`;
}

/**
 * A ticket is placed the moment it is posted, so "building" never applies;
 * once settled the result is the state.
 */
export function ticketPhaseLabel(
  phase: SlipPhase,
  result: ParlayResult,
): { label: string; className: string } {
  if (phase === "settled") {
    if (result === "won") return { label: "Won", className: "bg-lime text-accent-fg" };
    if (result === "lost") return { label: "Lost", className: "bg-ink/6 text-ink-muted" };
    return { label: "Push", className: "bg-ink/6 text-ink-muted" };
  }
  if (phase === "busted") return { label: "Busted", className: "bg-danger text-white" };
  if (phase === "live") return { label: "Live", className: "bg-lime text-accent-fg" };
  return { label: "Upcoming", className: "bg-raised text-raised-fg" };
}
