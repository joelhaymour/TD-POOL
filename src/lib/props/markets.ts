import type { PropMarketGroup } from "@/lib/types";

/**
 * The Odds API bills one credit per market a book actually prices, so the
 * board loads in two tiers: the core markets every group wants on open, and
 * the long tail (alternate lines, defence, period lines) on request.
 *
 * Only markets that can be graded from an ESPN box score are listed. A market
 * nobody can settle would keep its slip out of History forever.
 */
export type PropMarketDef = {
  key: string;
  label: string;
  group: PropMarketGroup;
};

export const CORE_PROP_MARKETS: PropMarketDef[] = [
  // Game lines
  { key: "h2h", label: "Moneyline", group: "game_lines" },
  { key: "spreads", label: "Spread", group: "game_lines" },
  { key: "totals", label: "Total Points", group: "game_lines" },
  // Touchdown scorers
  { key: "player_anytime_td", label: "Anytime TD", group: "td_scorers" },
  { key: "player_1st_td", label: "First TD", group: "td_scorers" },
  { key: "player_tds_over", label: "Total TDs", group: "td_scorers" },
  // Passing
  { key: "player_pass_yds", label: "Passing Yards", group: "passing" },
  { key: "player_pass_tds", label: "Passing TDs", group: "passing" },
  { key: "player_pass_attempts", label: "Pass Attempts", group: "passing" },
  { key: "player_pass_completions", label: "Completions", group: "passing" },
  { key: "player_pass_interceptions", label: "Interceptions", group: "passing" },
  // Rushing
  { key: "player_rush_yds", label: "Rushing Yards", group: "rushing" },
  { key: "player_rush_attempts", label: "Rush Attempts", group: "rushing" },
  { key: "player_rush_reception_yds", label: "Rush + Rec Yards", group: "rushing" },
  // Receiving
  { key: "player_receptions", label: "Receptions", group: "receiving" },
  { key: "player_reception_yds", label: "Receiving Yards", group: "receiving" },
  // Kicking
  { key: "player_field_goals", label: "Field Goals Made", group: "kicking" },
  { key: "player_kicking_points", label: "Kicking Points", group: "kicking" },
];

export const EXTENDED_PROP_MARKETS: PropMarketDef[] = [
  // Alternate lines — FanDuel's "30+ yards" style ladders
  { key: "player_pass_yds_alternate", label: "Passing Yards+", group: "passing" },
  { key: "player_pass_tds_alternate", label: "Passing TDs+", group: "passing" },
  { key: "player_pass_attempts_alternate", label: "Pass Attempts+", group: "passing" },
  { key: "player_pass_completions_alternate", label: "Completions+", group: "passing" },
  { key: "player_pass_interceptions_alternate", label: "Interceptions+", group: "passing" },
  { key: "player_rush_yds_alternate", label: "Rushing Yards+", group: "rushing" },
  { key: "player_rush_attempts_alternate", label: "Rush Attempts+", group: "rushing" },
  { key: "player_rush_longest_alternate", label: "Longest Rush+", group: "rushing" },
  { key: "player_rush_reception_yds_alternate", label: "Rush + Rec Yards+", group: "rushing" },
  { key: "player_reception_yds_alternate", label: "Receiving Yards+", group: "receiving" },
  { key: "player_receptions_alternate", label: "Receptions+", group: "receiving" },
  { key: "player_reception_longest_alternate", label: "Longest Reception+", group: "receiving" },
  { key: "player_rush_reception_tds_alternate", label: "Rush + Rec TDs+", group: "td_scorers" },
  { key: "player_pass_rush_reception_yds_alternate", label: "Pass + Rush + Rec Yards+", group: "passing" },
  { key: "player_pass_rush_reception_tds_alternate", label: "Pass + Rush + Rec TDs+", group: "td_scorers" },
  { key: "player_field_goals_alternate", label: "Field Goals+", group: "kicking" },
  { key: "player_kicking_points_alternate", label: "Kicking Points+", group: "kicking" },
  { key: "player_pats_alternate", label: "Extra Points+", group: "kicking" },
  { key: "player_sacks_alternate", label: "Sacks+", group: "defense" },
  { key: "player_solo_tackles_alternate", label: "Solo Tackles+", group: "defense" },
  { key: "player_tackles_assists_alternate", label: "Tackles + Assists+", group: "defense" },
  { key: "player_assists_alternate", label: "Assists+", group: "defense" },
  { key: "player_defensive_interceptions_alternate", label: "Interceptions+", group: "defense" },
  // More player markets
  { key: "player_last_td", label: "Last TD", group: "td_scorers" },
  { key: "player_rush_tds", label: "Rushing TDs", group: "rushing" },
  { key: "player_reception_tds", label: "Receiving TDs", group: "receiving" },
  { key: "player_rush_reception_tds", label: "Rush + Rec TDs", group: "td_scorers" },
  { key: "player_pass_rush_reception_tds", label: "Pass + Rush + Rec TDs", group: "td_scorers" },
  { key: "player_pass_rush_reception_yds", label: "Pass + Rush + Rec Yards", group: "passing" },
  { key: "player_pass_rush_yds", label: "Pass + Rush Yards", group: "passing" },
  { key: "player_rush_longest", label: "Longest Rush", group: "rushing" },
  { key: "player_reception_longest", label: "Longest Reception", group: "receiving" },
  { key: "player_pats", label: "Extra Points", group: "kicking" },
  { key: "player_sacks", label: "Sacks", group: "defense" },
  { key: "player_solo_tackles", label: "Solo Tackles", group: "defense" },
  { key: "player_tackles_assists", label: "Tackles + Assists", group: "defense" },
  { key: "player_assists", label: "Assists", group: "defense" },
  { key: "player_defensive_interceptions", label: "Interceptions", group: "defense" },
  // More game lines
  { key: "alternate_spreads", label: "Alt Spread", group: "game_lines" },
  { key: "alternate_totals", label: "Alt Total Points", group: "game_lines" },
  { key: "team_totals", label: "Team Total", group: "game_lines" },
  { key: "h2h_h1", label: "1st Half Moneyline", group: "game_lines" },
  { key: "spreads_h1", label: "1st Half Spread", group: "game_lines" },
  { key: "totals_h1", label: "1st Half Total", group: "game_lines" },
  { key: "h2h_q1", label: "1st Quarter Moneyline", group: "game_lines" },
  { key: "spreads_q1", label: "1st Quarter Spread", group: "game_lines" },
  { key: "totals_q1", label: "1st Quarter Total", group: "game_lines" },
];

export const PROP_MARKETS: PropMarketDef[] = [
  ...CORE_PROP_MARKETS,
  ...EXTENDED_PROP_MARKETS,
];

export const CORE_MARKET_KEYS = CORE_PROP_MARKETS.map((m) => m.key);
export const EXTENDED_MARKET_KEYS = EXTENDED_PROP_MARKETS.map((m) => m.key);

const CORE_SET = new Set(CORE_MARKET_KEYS);
const EXTENDED_SET = new Set(EXTENDED_MARKET_KEYS);

export function isCoreMarket(key: string): boolean {
  return CORE_SET.has(key);
}

export function isExtendedMarket(key: string): boolean {
  return EXTENDED_SET.has(key);
}

/** "30+ yards" ladders: one-sided, and they win on the line, not over it. */
export function isAlternateMarket(key: string): boolean {
  return key.endsWith("_alternate");
}

const BY_KEY = new Map(PROP_MARKETS.map((m) => [m.key, m]));

export function propMarketDef(key: string): PropMarketDef | null {
  return BY_KEY.get(key) ?? null;
}

export const PROP_GROUP_LABELS: Record<PropMarketGroup, string> = {
  game_lines: "Game Lines",
  td_scorers: "TD Scorers",
  passing: "Passing",
  rushing: "Rushing",
  receiving: "Receiving",
  kicking: "Kicking",
  defense: "Defense",
};

export const PROP_GROUP_ORDER: PropMarketGroup[] = [
  "td_scorers",
  "game_lines",
  "passing",
  "rushing",
  "receiving",
  "kicking",
  "defense",
];
