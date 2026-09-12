import {
  normalizePlayerName,
  teamFullToAbbr,
} from "@/lib/providers/the-odds-api/maps";
import {
  emptyStatLine,
  type GameBoxScore,
  type PlayerStatLine,
} from "@/lib/props/box-score";
import { isAlternateMarket } from "@/lib/props/markets";
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

const PLAYER_STATS: Record<string, (s: PlayerStatLine) => number> = {
  player_pass_yds: (s) => s.passYds,
  player_pass_tds: (s) => s.passTds,
  player_pass_attempts: (s) => s.passAtt,
  player_pass_completions: (s) => s.passCmp,
  player_pass_interceptions: (s) => s.passInt,
  player_rush_yds: (s) => s.rushYds,
  player_rush_attempts: (s) => s.rushAtt,
  player_rush_tds: (s) => s.rushTds,
  player_rush_longest: (s) => s.longRush,
  player_receptions: (s) => s.rec,
  player_reception_yds: (s) => s.recYds,
  player_reception_tds: (s) => s.recTds,
  player_reception_longest: (s) => s.longRec,
  player_rush_reception_yds: (s) => s.rushYds + s.recYds,
  player_rush_reception_tds: (s) => s.rushTds + s.recTds,
  player_pass_rush_yds: (s) => s.passYds + s.rushYds,
  player_pass_rush_reception_yds: (s) => s.passYds + s.rushYds + s.recYds,
  player_pass_rush_reception_tds: (s) => s.passTds + s.rushTds + s.recTds,
  player_field_goals: (s) => s.fgMade,
  player_kicking_points: (s) => s.kickPts,
  player_pats: (s) => s.pats,
  player_sacks: (s) => s.sacks,
  player_solo_tackles: (s) => s.soloTackles,
  player_tackles_assists: (s) => s.tackles,
  player_assists: (s) => Math.max(0, s.tackles - s.soloTackles),
  player_defensive_interceptions: (s) => s.defInts,
  player_tds_over: scoredTouchdowns,
};

const MONEYLINE = new Set(["h2h", "h2h_h1", "h2h_q1"]);
const SPREAD = new Set(["spreads", "spreads_h1", "spreads_q1", "alternate_spreads"]);
const TOTAL = new Set(["totals", "totals_h1", "totals_q1", "alternate_totals"]);

function compareLine(actual: number, line: number | null, side: string): LegResult {
  if (line == null) return "void";
  if (actual === line) return "push";
  const over = actual > line;
  if (side === "under") return over ? "lost" : "won";
  return over ? "won" : "lost";
}

/** "30+ yards" wins on the number, so it has no push. */
function atLeast(actual: number, line: number | null): LegResult {
  if (line == null) return "void";
  return actual >= line ? "won" : "lost";
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

/** Full game, first half, or first quarter, depending on the market. */
function scoreScope(
  box: GameBoxScore,
  marketKey: string,
): { home: number; away: number } | null {
  const sum = (points: number[], upTo: number) =>
    points.slice(0, upTo).reduce((a, b) => a + b, 0);
  if (marketKey.endsWith("_q1") || marketKey.endsWith("_h1")) {
    const quarters = marketKey.endsWith("_q1") ? 1 : 2;
    if (box.periods.home.length < quarters || box.periods.away.length < quarters) {
      return null;
    }
    return {
      home: sum(box.periods.home, quarters),
      away: sum(box.periods.away, quarters),
    };
  }
  return { home: box.home.score, away: box.away.score };
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
  const key = leg.market_key;

  if (MONEYLINE.has(key) || SPREAD.has(key)) {
    const scope = scoreScope(box, key);
    if (!scope) return null;
    if (side === "draw") {
      return { result: yesNo(scope.home === scope.away, "yes"), actual: 0 };
    }
    const team = teamFullToAbbr(leg.outcome_label);
    const mine =
      team === box.home.abbr
        ? scope.home
        : team === box.away.abbr
          ? scope.away
          : null;
    if (mine == null) return null;
    const theirs = team === box.home.abbr ? scope.away : scope.home;
    const margin = mine - theirs;
    const covered = SPREAD.has(key) ? margin + (leg.line ?? 0) : margin;
    return {
      result: covered > 0 ? "won" : covered < 0 ? "lost" : "push",
      actual: margin,
    };
  }

  if (TOTAL.has(key)) {
    const scope = scoreScope(box, key);
    if (!scope) return null;
    const total = scope.home + scope.away;
    return { result: compareLine(total, leg.line, side), actual: total };
  }

  // Team totals name the team in the same field player props use.
  if (key === "team_totals") {
    const team = leg.player_name ? teamFullToAbbr(leg.player_name) : null;
    const points =
      team === box.home.abbr
        ? box.home.score
        : team === box.away.abbr
          ? box.away.score
          : null;
    if (points == null) return null;
    return { result: compareLine(points, leg.line, side), actual: points };
  }

  if (!leg.player_name) return null;

  const alternate = isAlternateMarket(key);
  const base = alternate ? key.slice(0, -"_alternate".length) : key;

  const dst = defenseTeam(leg.player_name);
  if (dst) {
    if (base === "player_anytime_td") {
      const tds = box.dstTouchdowns[dst] ?? 0;
      return { result: yesNo(tds > 0, side), actual: tds };
    }
    if (base === "player_1st_td" || base === "player_last_td") {
      const play = base === "player_1st_td" ? box.firstTouchdown : box.lastTouchdown;
      return {
        result: yesNo(Boolean(play?.defensive && play.team === dst), side),
        actual: null,
      };
    }
    return null;
  }

  const found = findPlayer(leg.player_name, box);
  if (!found && box.ruledOut.has(normalizePlayerName(leg.player_name))) {
    return { result: "void", actual: null };
  }
  const stats = found ?? emptyStatLine(leg.player_name);

  if (base === "player_anytime_td") {
    const tds = scoredTouchdowns(stats);
    return { result: yesNo(tds > 0, side), actual: tds };
  }

  if (base === "player_1st_td" || base === "player_last_td") {
    const play = base === "player_1st_td" ? box.firstTouchdown : box.lastTouchdown;
    const scored = Boolean(
      play && !play.defensive && sameName(play.scorer, leg.player_name),
    );
    return { result: yesNo(scored, side), actual: null };
  }

  const accessor = PLAYER_STATS[base];
  if (!accessor) return null;
  const actual = accessor(stats);
  return {
    result: alternate
      ? atLeast(actual, leg.line)
      : compareLine(actual, leg.line, side),
    actual,
  };
}
