import type { PropMarketGroup } from "@/lib/types";

/**
 * Every market the group-betting board pulls from The Odds API, in display
 * order. The Odds API bills per market RETURNED (not requested), so listing a
 * market a book does not price costs nothing.
 */
export type PropMarketDef = {
  key: string;
  label: string;
  group: PropMarketGroup;
};

export const PROP_MARKETS: PropMarketDef[] = [
  // Game lines
  { key: "h2h", label: "Moneyline", group: "game_lines" },
  { key: "spreads", label: "Spread", group: "game_lines" },
  { key: "totals", label: "Total Points", group: "game_lines" },
  // Touchdown scorers
  { key: "player_anytime_td", label: "Anytime TD", group: "td_scorers" },
  { key: "player_1st_td", label: "First TD", group: "td_scorers" },
  { key: "player_tds_over", label: "Total TDs Over", group: "td_scorers" },
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

export const PROP_MARKET_KEYS = PROP_MARKETS.map((m) => m.key);

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
};

export const PROP_GROUP_ORDER: PropMarketGroup[] = [
  "td_scorers",
  "game_lines",
  "passing",
  "rushing",
  "receiving",
  "kicking",
];
