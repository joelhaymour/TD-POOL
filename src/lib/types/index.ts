/** Domain types for the Anytime TD Pool app. */

export type BettingMode = "individual" | "fixed" | "none";
export type PickLockType = "first_kickoff" | "custom" | "individual_game";
export type OddsFormat = "american" | "decimal";
export type Currency = "USD" | "CAD";
export type MemberRole = "admin" | "member";
export type PickResult = "pending" | "td" | "no_td" | "game_not_finished";
export type PlayerAvailability =
  | "available"
  | "taken"
  | "locked"
  | "injured"
  | "questionable";

export type InjuryStatus =
  | "healthy"
  | "questionable"
  | "doubtful"
  | "out"
  | "injured_reserve";

export type TrendDirection = "up" | "stable" | "down";

export type TdTier =
  | "elite"
  | "strong"
  | "solid"
  | "average"
  | "long_shot";

export type PlayerPosition = "RB" | "WR" | "TE" | "QB";

export type GameStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "canceled";

export interface League {
  id: string;
  name: string;
  slug: string;
  admin_user_id: string | null;
  currency: Currency;
  betting_mode: BettingMode;
  contribution_per_member: number | null;
  fixed_weekly_stake: number | null;
  pick_lock_type: PickLockType;
  pick_deadline_at: string | null;
  allow_pick_changes: boolean;
  odds_format: OddsFormat;
  survivor_mode: boolean;
  join_pin: string;
  logo_url: string | null;
  active_week_id: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface LeagueMember {
  id: string;
  league_id: string;
  user_id: string | null;
  display_name: string;
  role: MemberRole;
  active: boolean;
  created_at: string;
}

export interface NflWeek {
  id: string;
  season: number;
  week: number;
  start_date: string;
  end_date: string;
  label?: string;
}

export interface NflGame {
  id: string;
  week_id: string;
  external_game_id: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: GameStatus;
  spread: number | null;
  total: number | null;
  home_score: number | null;
  away_score: number | null;
  stadium: string | null;
  is_dome: boolean;
}

export interface NflPlayer {
  id: string;
  external_player_id: string | null;
  name: string;
  team: string;
  position: PlayerPosition;
  active: boolean;
  jersey_number: number | null;
  headshot_url: string | null;
}

/** Compact per-game log for TD Pool research. */
export interface ResearchGameLog {
  week: number;
  opponent: string;
  home: boolean;
  touchdowns: number;
  /** Red-zone touches (carries + targets inside the 20). */
  rz_touches: number;
  carries: number;
  rush_yards: number;
  receptions: number;
  receiving_yards: number;
  /**
   * Model input only — an estimate of inside-5 work derived from red-zone
   * attempts, not an observed stat. Never render this as a game-log number.
   */
  goal_line_chances: number;
}

export interface ResearchHistory {
  last_5: ResearchGameLog[];
  /** Prior meetings vs this week's opponent (most recent first). */
  vs_opponent: ResearchGameLog[];
  last_5_summary: string;
  vs_opponent_summary: string;
  recent_trend: TrendDirection;
  /**
   * Rolling season-length scoring sample (up to 17 games). The model rates on
   * this rather than last_5, because in Week 1 the five most recent games are
   * weeks 14-18, when contenders rest starters and reserves absorb the volume.
   */
  scoring_sample: { games: number; touchdowns: number };
}

export interface ResearchJson {
  why_we_like: string[];
  concerns: string[];
  verdict: string;
  red_zone: {
    carries: number;
    targets: number;
    touches_per_game: number;
    share: number;
  };
  goal_line: {
    carries_inside_10: number;
    carries_inside_5: number;
    team_share: number;
    opportunities: number;
  };
  matchup: {
    opponent: string;
    tds_allowed: number;
    red_zone_td_rate: number;
    rushing_tds_allowed: number;
    receiving_tds_allowed: number;
    position_rank_allowed: number;
    notes: string;
  };
  usage: {
    snap_share: number;
    carry_share: number | null;
    target_share: number | null;
    targets_per_game: number | null;
    end_zone_targets: number | null;
    recent_trend: TrendDirection;
    last_games_summary: string;
  };
  /** Preferred research block for recent / matchup history. */
  history?: ResearchHistory;
  game_environment: {
    spread: number | null;
    total: number | null;
    team_implied_points: number | null;
    weather: {
      temperature_f: number | null;
      wind_mph: number | null;
      precip_chance: number | null;
      severity: "none" | "mild" | "moderate" | "severe";
      notes: string;
    };
  };
  injuries: {
    player_status: InjuryStatus;
    player_detail: string | null;
    relevant: Array<{ name: string; status: InjuryStatus; note: string }>;
  };
  market: {
    consensus_american: number;
    consensus_implied: number;
    books: Array<{ sportsbook: string; american_odds: number }>;
  };
  /** Structured TD Pool engine payload (features + contributions). */
  td_model?: {
    version: string;
    data_completeness: number;
    limited_data: boolean;
    contributions: Array<{
      key: string;
      label: string;
      delta: number;
      factorScore: number;
      detail: string;
    }>;
    goal_line_percentile: number;
    matchup_percentile: number;
    features: Record<string, unknown>;
    calculated_at: string;
  };
}

export interface PlayerWeekData {
  id: string;
  player_id: string;
  week_id: string;
  game_id: string;
  market_probability: number;
  our_probability: number;
  td_pool_score: number;
  td_pool_rank: number;
  matchup_rating: number;
  goal_line_rating: number;
  research_json: ResearchJson;
  injury_status: InjuryStatus;
  availability: PlayerAvailability;
  tier: TdTier;
  consensus_american_odds: number;
  consensus_decimal_odds: number;
  updated_at: string;
}

export interface PlayerOdds {
  id: string;
  player_id: string;
  game_id: string;
  week_id: string;
  sportsbook: string;
  market: string;
  american_odds: number;
  decimal_odds: number;
  implied_probability: number;
  fetched_at: string;
}

export interface Pick {
  id: string;
  league_id: string;
  member_id: string;
  week_id: string;
  player_id: string;
  odds_at_selection: number;
  probability_at_selection: number;
  picked_at: string;
  result: PickResult;
  touchdown_scored: boolean | null;
  overridden: boolean;
}

export interface MemberPickStatus {
  member: LeagueMember;
  pick: Pick | null;
  player: NflPlayer | null;
  player_week: PlayerWeekData | null;
}

export interface ParlaySummary {
  picks_submitted: number;
  picks_total: number;
  stake: number;
  combined_decimal: number | null;
  combined_american: number | null;
  estimated_payout: number | null;
  estimated_profit: number | null;
  currency: Currency;
  betting_mode: BettingMode;
}

export interface LeagueDashboard {
  league: League;
  week: NflWeek;
  members: MemberPickStatus[];
  parlay: ParlaySummary;
  ranked_players: Array<
    PlayerWeekData & {
      player: NflPlayer;
      game: NflGame;
      taken_by: string | null;
    }
  >;
  pick_lock_at: string | null;
  picks_locked: boolean;
  odds_updated_at: string | null;
  /** Where the latest odds snapshot came from. "none" = no prices available. */
  odds_source?: "live" | "mock" | "none";
  /** Why odds are missing, when they are. Surfaced so "Unavailable" explains itself. */
  odds_note?: string | null;
}

export interface CreateLeagueInput {
  name: string;
  slug?: string;
  currency?: Currency;
  betting_mode?: BettingMode;
  contribution_per_member?: number | null;
  fixed_weekly_stake?: number | null;
  pick_lock_type?: PickLockType;
  pick_deadline_at?: string | null;
  allow_pick_changes?: boolean;
  odds_format?: OddsFormat;
  survivor_mode?: boolean;
  join_pin: string;
  admin_display_name: string;
  /** Auth user who owns the league and takes the admin seat. */
  admin_user_id?: string | null;
  member_names?: string[];
  member_count?: number;
  logo_url?: string | null;
}

export interface SelectPickInput {
  league_id: string;
  member_id: string;
  week_id: string;
  player_id: string;
}

export interface UpdateLeagueSettingsInput {
  name?: string;
  currency?: Currency;
  betting_mode?: BettingMode;
  contribution_per_member?: number | null;
  fixed_weekly_stake?: number | null;
  pick_lock_type?: PickLockType;
  pick_deadline_at?: string | null;
  allow_pick_changes?: boolean;
  odds_format?: OddsFormat;
  survivor_mode?: boolean;
  join_pin?: string;
  logo_url?: string | null;
  member_count?: number;
  active_week_id?: string | null;
}
