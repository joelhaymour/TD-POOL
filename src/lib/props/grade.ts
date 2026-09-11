import {
  normalizePlayerName,
  teamFullToAbbr,
} from "@/lib/providers/the-odds-api/maps";
import {
  emptyStatLine,
  type GameBoxScore,
  type PlayerStatLine,
} from "@/lib/props/box-score";
import type { LegResult } from "@/lib/types";

export type GradableLeg = {
  market_key: string;
  player_name: string | null;
  outcome_label: string;
  line: number | null;
};

export type LegGrade = { result: LegResult; actual: number | null };

/** Touchdowns the player scored himself — thrown passing TDs do not count. */
export function scoredTouchdowns(s: PlayerStatLine): number {
  return s.rushTds + s.recTds + s.retTds + s.defTds;
}

const STAT_MARKETS: Record<string, (s: PlayerStatLine) => number> = {
  player_pass_yds: (s) => s.passYds,
  player_pass_tds: (s) => s.passTds,
  player_pass_attempts: (s) => s.passAtt,
  player_pass_completions: (s) => s.passCmp,
  player_pass_interceptions: (s) => s.passInt,
  player_rush_yds: (s) => s.rushYds,
  player_rush_attempts: (s) => s.rushAtt,
  player_rush_reception_yds: (s) => s.rushYds + s.recYds,
  player_receptions: (s) => s.rec,
  player_reception_yds: (s) => s.recYds,
  player_field_goals: (s) => s.fgMade,
  player_kicking_points: (s) => s.kickPts,
  player_tds_over: scoredTouchdowns,
};

function compareLine(actual: number, line: number | null, side: string): LegResult {
  if (line == null) return "void";
  if (actual === line) return "push";
  const over = actual > line;
  if (side === "under") return over ? "lost" : "won";
  return over ? "won" : "lost";
}

function yesNo(happened: boolean, side: string): LegResult {
  return happened !== (side === "no") ? "won" : "lost";
}

/** "Pittsburgh Steelers Defense" → "PIT"; plain player names → null. */
function defenseTeam(name: string): string | null {
  const stripped = name.replace(/\s*(defense|d\/st|dst)\s*$/i, "");
  return stripped === name ? null : teamFullToAbbr(stripped);
}

function lastAndInitial(norm: string): string | null {
  const parts = norm.split(" ");
  return parts.length >= 2 ? `${parts.at(-1)}|${parts[0]![0]}` : null;
}

function sameName(a: string, b: string): boolean {
  const x = normalizePlayerName(a);
  const y = normalizePlayerName(b);
  if (x === y) return true;
  const kx = lastAndInitial(x);
  return kx != null && kx === lastAndInitial(y);
}

/** Sportsbook and ESPN spell a few names differently ("DJ" vs "D.J."). */
function findPlayer(name: string, box: GameBoxScore): PlayerStatLine | null {
  const key = normalizePlayerName(name);
  const exact = box.players.get(key);
  if (exact) return exact;
  const want = lastAndInitial(key);
  if (!want) return null;
  const soft = [...box.players.entries()].filter(
    ([k]) => lastAndInitial(k) === want,
  );
  return soft.length === 1 ? soft[0]![1] : null;
}

/**
 * Grade one leg against a final box score. Returns null when the market or
 * team cannot be resolved, which leaves the leg pending for an admin to grade.
 *
 * A player missing from the box score counts as zero across the board unless
 * the injury report ruled him out, in which case the leg is void the way the
 * book voids it. An active player with no recorded stats is indistinguishable
 * from one who never took the field, so admins can correct either case.
 */
export function gradeLeg(leg: GradableLeg, box: GameBoxScore): LegGrade | null {
  const side = leg.outcome_label.trim().toLowerCase();

  if (leg.market_key === "h2h" || leg.market_key === "spreads") {
    const team = teamFullToAbbr(leg.outcome_label);
    const mine =
      team === box.home.abbr ? box.home : team === box.away.abbr ? box.away : null;
    if (!mine) return null;
    const theirs = mine === box.home ? box.away : box.home;
    const margin = mine.score - theirs.score;
    const covered =
      leg.market_key === "spreads" ? margin + (leg.line ?? 0) : margin;
    return {
      result: covered > 0 ? "won" : covered < 0 ? "lost" : "push",
      actual: margin,
    };
  }

  if (leg.market_key === "totals") {
    const total = box.home.score + box.away.score;
    return { result: compareLine(total, leg.line, side), actual: total };
  }

  if (!leg.player_name) return null;

  const dst = defenseTeam(leg.player_name);
  if (dst) {
    if (leg.market_key === "player_anytime_td") {
      const tds = box.dstTouchdowns[dst] ?? 0;
      return { result: yesNo(tds > 0, side), actual: tds };
    }
    if (leg.market_key === "player_1st_td") {
      const first = box.firstTouchdown;
      const scored = Boolean(first?.defensive && first.team === dst);
      return { result: yesNo(scored, side), actual: null };
    }
    return null;
  }

  const found = findPlayer(leg.player_name, box);
  if (!found && box.ruledOut.has(normalizePlayerName(leg.player_name))) {
    return { result: "void", actual: null };
  }
  const stats = found ?? emptyStatLine(leg.player_name);

  if (leg.market_key === "player_anytime_td") {
    const tds = scoredTouchdowns(stats);
    return { result: yesNo(tds > 0, side), actual: tds };
  }

  if (leg.market_key === "player_1st_td") {
    const first = box.firstTouchdown;
    const scored = Boolean(
      first && !first.defensive && sameName(first.scorer, leg.player_name),
    );
    return { result: yesNo(scored, side), actual: null };
  }

  const accessor = STAT_MARKETS[leg.market_key];
  if (!accessor) return null;
  const actual = accessor(stats);
  return { result: compareLine(actual, leg.line, side), actual };
}
