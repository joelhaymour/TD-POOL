import { calculateWeeklyStake, decimalToAmerican } from "@/lib/utils/odds";
import type {
  League,
  NflGame,
  Parlay,
  ParlayLeg,
  ParlayResult,
} from "@/lib/types";

export type SlipPhase = "building" | "locked" | "live" | "busted" | "settled";

/** A game is closed to new legs from kickoff, even before ESPN flips its status. */
export function gameStarted(game: NflGame | undefined, now = Date.now()): boolean {
  if (!game) return false;
  if (game.status !== "scheduled") return true;
  return Date.parse(game.kickoff_at) <= now;
}

type StakeLeague = Pick<
  League,
  "betting_mode" | "contribution_per_member" | "fixed_weekly_stake" | "member_count"
>;

/** A group slip falls back to the league's weekly stake; a ticket is what was actually wagered. */
export function slipStake(
  parlay: Pick<Parlay, "stake" | "kind">,
  league: StakeLeague,
): number {
  if (parlay.kind === "ticket") return parlay.stake ?? 0;
  return parlay.stake ?? calculateWeeklyStake(league);
}

type PricedLeg = Pick<ParlayLeg, "decimal_odds" | "result">;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Price every leg still in play. Pushes and voids drop out of a parlay rather
 * than killing it, so they are excluded instead of priced at even money. A
 * leg with no price (a ticket read off a slip that only printed the total)
 * makes the product meaningless, so nothing is estimated rather than a guess.
 */
export function slipEstimate(
  legs: PricedLeg[],
  stake: number,
): { decimal: number | null; american: number | null; payout: number | null } {
  const live = legs.filter((l) => l.result !== "push" && l.result !== "void");
  if (live.length === 0 || live.some((l) => l.decimal_odds == null)) {
    return { decimal: null, american: null, payout: null };
  }
  const decimal = live.reduce((acc, l) => acc * l.decimal_odds!, 1);
  return {
    decimal: Number(decimal.toFixed(4)),
    american: decimalToAmerican(decimal),
    payout: stake > 0 ? round2(stake * decimal) : null,
  };
}

/**
 * Settle a slip from its graded legs. A single losing leg decides the result,
 * but `settled` waits for every leg so a busted slip stays on Home until the
 * rest of its games finish. A ticket pays what its slip printed
 * (`fixedPayout`): a same-game parlay is priced by the book, not its legs.
 */
export function settleSlip(
  legs: PricedLeg[],
  stake: number,
  fixedPayout: number | null = null,
): { result: ParlayResult; payout: number | null; settled: boolean } {
  if (legs.length === 0) return { result: "pending", payout: null, settled: false };
  const allGraded = legs.every((l) => l.result !== "pending");
  if (legs.some((l) => l.result === "lost")) {
    return { result: "lost", payout: 0, settled: allGraded };
  }
  if (!allGraded) return { result: "pending", payout: null, settled: false };
  const won = legs.filter((l) => l.result === "won");
  if (won.length === 0) return { result: "push", payout: stake, settled: true };
  if (fixedPayout != null) return { result: "won", payout: fixedPayout, settled: true };
  if (won.some((l) => l.decimal_odds == null)) {
    return { result: "won", payout: null, settled: true };
  }
  const decimal = won.reduce((acc, l) => acc * l.decimal_odds!, 1);
  return { result: "won", payout: round2(stake * decimal), settled: true };
}

export function slipPhase(
  parlay: Pick<Parlay, "status" | "settled_at">,
  legs: Pick<ParlayLeg, "result" | "game_id">[],
  gamesById: Map<string, NflGame>,
  now = Date.now(),
): SlipPhase {
  if (parlay.settled_at) return "settled";
  if (legs.some((l) => l.result === "lost")) return "busted";
  if (legs.some((l) => gameStarted(gamesById.get(l.game_id), now))) return "live";
  if (parlay.status === "locked") return "locked";
  return "building";
}
