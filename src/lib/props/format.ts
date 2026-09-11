import type { LegResult, NflGame, ParlayLeg } from "@/lib/types";

type LabelLeg = Pick<
  ParlayLeg,
  "market_key" | "player_name" | "outcome_label" | "line"
>;

/** "Bijan Robinson", "Rico Dowdle Over 10.5", "Atlanta Falcons +3.5", "Over 47.5". */
export function legTitle(leg: LabelLeg): string {
  const subject = leg.player_name ?? leg.outcome_label;
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
  player_rush_reception_yds: "yds",
  player_receptions: "catches",
  player_reception_yds: "rec yds",
  player_field_goals: "FG",
  player_kicking_points: "pts",
  player_tds_over: "TD",
  player_anytime_td: "TD",
  totals: "pts",
};

/** The graded stat in words: "23 rec yds", "won by 3". */
export function actualLabel(
  leg: Pick<ParlayLeg, "market_key" | "actual_value">,
): string | null {
  const v = leg.actual_value;
  if (v == null) return null;
  if (leg.market_key === "h2h" || leg.market_key === "spreads") {
    return v > 0 ? `won by ${v}` : v < 0 ? `lost by ${-v}` : "tied";
  }
  const unit = UNITS[leg.market_key];
  return unit ? `${v} ${unit}` : String(v);
}

export const RESULT_META: Record<LegResult, { icon: string; label: string }> = {
  pending: { icon: "⏳", label: "Pending" },
  won: { icon: "✅", label: "Hit" },
  lost: { icon: "❌", label: "Miss" },
  push: { icon: "↩️", label: "Push" },
  void: { icon: "⚪", label: "Void" },
};

export function gameLabel(game: Pick<NflGame, "away_team" | "home_team"> | undefined): string {
  return game ? `${game.away_team} @ ${game.home_team}` : "";
}
