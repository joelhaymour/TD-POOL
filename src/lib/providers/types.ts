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

export interface NFLDataProvider {
  getWeekSchedule(season: number, week: number): Promise<ProviderGame[]>;
  getPlayersForWeek(season: number, week: number): Promise<ProviderPlayer[]>;
  getPlayerByExternalId(externalPlayerId: string): Promise<ProviderPlayer | null>;
  getGameByExternalId(externalGameId: string): Promise<ProviderGame | null>;
  getRecentPlayerStats?(
    externalPlayerId: string,
    lastN?: number,
  ): Promise<ProviderPlayerGameStats[]>;
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
