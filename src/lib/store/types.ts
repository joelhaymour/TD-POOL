import type {
  CreateLeagueInput,
  League,
  LeagueDashboard,
  LeagueMember,
  Pick,
  PlayerWeekData,
  SelectPickInput,
  UpdateLeagueSettingsInput,
} from "@/lib/types";

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
