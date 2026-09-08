/** External data provider contracts for NFL, odds, weather, and injuries. */

export type ProviderSportsbook =
  | "FanDuel"
  | "DraftKings"
  | "Bet365"
  | "BetMGM"
  | "Caesars"
  | "Fanatics"
  | "BetRivers"
  | "Consensus";

export interface ProviderTeamRef {
  abbreviation: string;
  name: string;
  city: string;
}

export interface ProviderGame {
  external_game_id: string;
  season: number;
  week: number;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
  spread: number | null;
  total: number | null;
  stadium: string | null;
  is_dome: boolean;
  home_score: number | null;
  away_score: number | null;
}

export interface ProviderPlayer {
  external_player_id: string;
  name: string;
  team: string;
  position: "RB" | "WR" | "TE" | "QB";
  active: boolean;
  jersey_number: number | null;
  headshot_url: string | null;
}

export interface ProviderPlayerGameStats {
  external_player_id: string;
  external_game_id: string;
  rushes: number;
  targets: number;
  receptions: number;
  rush_yards: number;
  receiving_yards: number;
  touchdowns: number;
  red_zone_touches: number;
  goal_line_carries: number;
  snap_share: number;
}

export interface OddsQuote {
  external_player_id: string;
  external_game_id: string;
  sportsbook: ProviderSportsbook;
  market: "anytime_td";
  american_odds: number;
  decimal_odds: number;
  implied_probability: number;
  fetched_at: string;
}

export interface ConsensusOdds {
  external_player_id: string;
  external_game_id: string;
  american_odds: number;
  decimal_odds: number;
  implied_probability: number;
  books: OddsQuote[];
  fetched_at: string;
}

export interface InjuryReport {
  external_player_id: string;
  player_name: string;
  team: string;
  status: "healthy" | "questionable" | "doubtful" | "out" | "injured_reserve";
  body_part: string | null;
  detail: string | null;
  updated_at: string;
}

export interface WeatherReport {
  external_game_id: string;
  temperature_f: number | null;
  wind_mph: number | null;
  precip_chance: number | null;
  condition: string;
  severity: "none" | "mild" | "moderate" | "severe";
  notes: string;
  is_dome: boolean;
  fetched_at: string;
}

export interface PlayerTouchdownResult {
  external_player_id: string;
  /** Display name when available — used to match mock roster IDs. */
  player_name?: string;
  external_game_id: string;
  touchdowns: number;
  game_status: ProviderGame["status"];
}

export interface NFLDataProvider {
  getWeekSchedule(season: number, week: number): Promise<ProviderGame[]>;
  getPlayersForWeek(season: number, week: number): Promise<ProviderPlayer[]>;
  getPlayerByExternalId(externalPlayerId: string): Promise<ProviderPlayer | null>;
  getGameByExternalId(externalGameId: string): Promise<ProviderGame | null>;
  getRecentPlayerStats?(
    externalPlayerId: string,
    lastN?: number,
  ): Promise<ProviderPlayerGameStats[]>;
  /** Optional Phase 2: resolve current NFL week from calendar. */
  getCurrentWeek?(asOf?: Date): Promise<{ season: number; week: number }>;
  /** Optional Phase 2: player TD counts for a week (0 when game not final). */
  getPlayerTouchdownsForWeek?(
    season: number,
    week: number,
    asOf?: Date,
  ): Promise<PlayerTouchdownResult[]>;
  /** Optional Phase 2: recompute game statuses/scores relative to asOf. */
  refreshGameStatuses?(
    season: number,
    week: number,
    asOf?: Date,
  ): Promise<ProviderGame[]>;
}

export interface OddsProvider {
  getAnytimeTdOdds(
    season: number,
    week: number,
    sportsbooks?: ProviderSportsbook[],
  ): Promise<OddsQuote[]>;
  getConsensusAnytimeTdOdds(
    season: number,
    week: number,
  ): Promise<ConsensusOdds[]>;
  /**
   * Credits left on a metered plan, when the provider reports them. Surfaced so
   * the board can warn before the allowance runs out instead of going blank.
   */
  getQuotaRemaining?(): number | null;
  getPlayerOdds(
    externalPlayerId: string,
    season: number,
    week: number,
  ): Promise<OddsQuote[]>;
}

export interface WeatherProvider {
  getGameWeather(externalGameId: string): Promise<WeatherReport | null>;
  getWeekWeather(season: number, week: number): Promise<WeatherReport[]>;
}

export interface InjuryProvider {
  getWeekInjuries(season: number, week: number): Promise<InjuryReport[]>;
  getPlayerInjury(externalPlayerId: string): Promise<InjuryReport | null>;
  getTeamInjuries(team: string, season: number, week: number): Promise<InjuryReport[]>;
}
