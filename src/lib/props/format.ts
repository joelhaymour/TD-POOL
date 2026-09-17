import { isAlternateMarket } from "@/lib/props/markets";
import { formatAmerican } from "@/lib/utils/odds";
import type { LegResult, NflGame, ParlayLeg } from "@/lib/types";

type LabelLeg = Pick<
  ParlayLeg,
  "market_key" | "player_name" | "outcome_label" | "line"
>;

/**
 * "Bijan Robinson", "Rico Dowdle Over 10.5", "Cade Otton 30+",
 * "Atlanta Falcons +3.5", "Over 47.5".
 */
export function legTitle(leg: LabelLeg): string {
  const subject = leg.player_name ?? leg.outcome_label;
  if (isAlternateMarket(leg.market_key) && leg.line != null) {
    return `${subject} ${leg.line}+`;
  }
  const side =
    leg.player_name && leg.outcome_label !== "Yes" ? ` ${leg.outcome_label}` : "";
  let line = "";
  if (leg.line != null) {
    line =
      leg.market_key === "spreads" && leg.line > 0 ? ` +${leg.line}` : ` ${leg.line}`;
  }
  return `${subject}${side}${line}`;
}

const UNITS: Record<string, string> = {
  player_pass_yds: "pass yds",
  player_pass_tds: "pass TD",
  player_pass_attempts: "att",
  player_pass_completions: "comp",
  player_pass_interceptions: "INT",
  player_rush_yds: "rush yds",
  player_rush_attempts: "carries",
  player_rush_tds: "rush TD",
  player_rush_longest: "long rush",
  player_rush_reception_yds: "yds",
  player_rush_reception_tds: "TD",
  player_pass_rush_yds: "yds",
  player_pass_rush_reception_yds: "yds",
  player_pass_rush_reception_tds: "TD",
  player_receptions: "catches",
  player_reception_yds: "rec yds",
  player_reception_tds: "rec TD",
  player_reception_longest: "long rec",
  player_field_goals: "FG",
  player_kicking_points: "pts",
  player_pats: "XP",
  player_sacks: "sacks",
  player_solo_tackles: "solo",
  player_tackles_assists: "tackles",
  player_assists: "assists",
  player_defensive_interceptions: "INT",
  player_tds_over: "TD",
  player_anytime_td: "TD",
  totals: "pts",
  totals_h1: "1H pts",
  totals_q1: "Q1 pts",
  alternate_totals: "pts",
  team_totals: "pts",
};

/**
 * The leg in a few characters, for the label under its progress bar:
 * "St. Brown o6.5", "Cook ATD", "Allen o249.5", "Falcons -3.5", "o47.5".
 */
export function legShortTitle(leg: LabelLeg): string {
  const key = leg.market_key;
  const base = key.replace(/_alternate$/, "");
  const side = leg.outcome_label.trim().toLowerCase();
  const line = leg.line != null ? String(leg.line) : "";
  // First name dropped, so "Amon-Ra St. Brown" keeps its "St."
  const who = leg.player_name
    ? leg.player_name.trim().split(/\s+/).slice(1).join(" ") || leg.player_name
    : null;
  const team = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;

  if (base === "player_anytime_td") return `${who} ATD`;
  if (base === "player_1st_td") return `${who} 1st TD`;
  if (base === "player_last_td") return `${who} last TD`;
  if (key.startsWith("h2h")) return `${team(leg.outcome_label)} ML`;
  if (key.startsWith("spreads") || key === "alternate_spreads") {
    return `${team(leg.outcome_label)} ${leg.line != null && leg.line > 0 ? "+" : ""}${line}`;
  }
  if (key.startsWith("totals") || key === "alternate_totals") {
    return `${side === "under" ? "u" : "o"}${line}`;
  }
  if (key === "team_totals") {
    return `${team(leg.player_name ?? "")} ${side === "under" ? "u" : "o"}${line}`;
  }
  if (isAlternateMarket(key)) return `${who} ${line}+`;
  const marker = side === "under" ? "u" : side === "over" ? "o" : "";
  return `${who} ${marker}${line}`.trim();
}

/** "catches", "rec yds" — the unit a market's line is counted in, or null. */
export function legUnit(marketKey: string): string | null {
  return UNITS[marketKey.replace(/_alternate$/, "")] ?? null;
}

/** The graded stat in words: "23 rec yds", "won by 3", "42 rec yds so far". */
export function actualLabel(
  leg: Pick<ParlayLeg, "market_key" | "actual_value"> & { result?: LegResult },
): string | null {
  const v = leg.actual_value;
  if (v == null) return null;
  const key = leg.market_key.replace(/_alternate$/, "");
  if (key.startsWith("h2h") || key.startsWith("spreads") || key === "alternate_spreads") {
    return v > 0 ? `won by ${v}` : v < 0 ? `lost by ${-v}` : "tied";
  }
  const unit = UNITS[key];
  const stat = unit ? `${v} ${unit}` : String(v);
  return leg.result === "pending" ? `${stat} so far` : stat;
}

/**
 * "+140" / "-110", or null for a leg with no price of its own — a ticket
 * read off a slip that only printed the combined odds. Callers leave the
 * space empty rather than print "Unavailable" beside a bet that was placed.
 */
export function legPrice(american: number | null | undefined): string | null {
  return american == null || american === 0 ? null : formatAmerican(american);
}

/** Wording for a graded leg. The mark itself is drawn — see ResultMark. */
export const RESULT_META: Record<LegResult, { label: string }> = {
  pending: { label: "Pending" },
  won: { label: "Hit" },
  lost: { label: "Miss" },
  push: { label: "Push" },
  void: { label: "Void" },
};

export function gameLabel(
  game: Pick<NflGame, "away_team" | "home_team"> | undefined,
): string {
  return game ? `${game.away_team} @ ${game.home_team}` : "";
}
