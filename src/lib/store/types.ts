import type {
  CreateLeagueInput,
  GameStatus,
  League,
  LeagueDashboard,
  LeagueMember,
  NflGame,
  NflPlayer,
  NflWeek,
  Pick,
  PickResult,
  PlayerWeekData,
  SelectPickInput,
  UpdateLeagueSettingsInput,
} from "@/lib/types";
import type { ConsensusOdds, OddsQuote } from "@/lib/providers/types";

export type GameStatusUpdate = {
  id: string;
  status: GameStatus;
  home_score: number | null;
  away_score: number | null;
};

export type PickResultUpdate = {
  pickId: string;
  result: PickResult;
  touchdown_scored: boolean | null;
};

export type ApplyOddsRefreshInput = {
  weekId: string;
  consensus: ConsensusOdds[];
  quotes: OddsQuote[];
};

export interface Store {
  getLeagueBySlug(slug: string): Promise<League | null>;
  createLeague(input: CreateLeagueInput): Promise<League>;
  listMembers(leagueId: string): Promise<LeagueMember[]>;
  getPicksForWeek(leagueId: string, weekId: string): Promise<Pick[]>;
  /**
   * Atomically submit a pick.
   * Enforces: one pick per member per week, and unique (league_id, week_id, player_id).
   */
  submitPick(input: SelectPickInput): Promise<Pick>;
  changePick(input: SelectPickInput): Promise<Pick>;
  getPlayerWeekData(weekId: string): Promise<PlayerWeekData[]>;
  getDashboard(slug: string): Promise<LeagueDashboard | null>;
  updateLeagueSettings(
    leagueId: string,
    settings: UpdateLeagueSettingsInput,
  ): Promise<League>;
  /**
   * Admin override: force-assign a member's pick (may replace existing).
   * Still enforces player uniqueness within the week unless releasing first.
   */
  overridePick(input: SelectPickInput): Promise<Pick>;

  /** Phase 2: look up NFL week row by season + week number. */
  getWeekBySeasonWeek(
    season: number,
    week: number,
  ): Promise<NflWeek | null>;
  /** All NFL week rows in the store (supports multi-week history). */
  listWeeks(): Promise<NflWeek[]>;
  listGamesForWeek(weekId: string): Promise<NflGame[]>;
  listPlayers(): Promise<NflPlayer[]>;
  listLeagues(): Promise<League[]>;
  updateGameStatuses(updates: GameStatusUpdate[]): Promise<number>;
  resolvePickResults(updates: PickResultUpdate[]): Promise<number>;
  /** Phase 3: write fresh quotes + update consensus on player_week_data. */
  applyOddsRefresh(input: ApplyOddsRefreshInput): Promise<number>;
}

export class StoreError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "VALIDATION"
      | "LOCKED"
      | "FORBIDDEN",
  ) {
    super(message);
    this.name = "StoreError";
  }
}
