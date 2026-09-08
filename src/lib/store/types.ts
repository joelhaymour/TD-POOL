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

export type JoinLeagueInput = {
  slug: string;
  display_name: string;
  join_pin: string;
  /** Auth user claiming the membership, so the seat survives a sign-out. */
  user_id?: string | null;
};

/** A league the signed-in user belongs to, paired with their seat in it. */
export type UserLeague = {
  league: League;
  member: LeagueMember;
};

export type JoinLeagueResult = {
  league: League;
  member: LeagueMember;
};

/** Cross-instance refresh coordination (serverless has no shared memory). */
export type SyncStateRow = {
  key: string;
  last_run_at: string;
  last_ok_at: string | null;
  status: string;
  detail: Record<string, unknown>;
};

/** Failed and abandoned runs must not hold a refresh slot for the full TTL. */
const SYNC_ERROR_RETRY_MS = 5 * 60_000;
const SYNC_RUNNING_STALE_MS = 10 * 60_000;

export function effectiveSyncTtl(
  state: { status: string },
  ttlMs: number,
): number {
  if (state.status === "error") return Math.min(ttlMs, SYNC_ERROR_RETRY_MS);
  if (state.status === "running") return Math.min(ttlMs, SYNC_RUNNING_STALE_MS);
  return ttlMs;
}

export interface Store {
  getLeagueBySlug(slug: string): Promise<League | null>;
  createLeague(input: CreateLeagueInput): Promise<League>;
  /** Join via slug + join PIN; creates (or reactivates) a member row. */
  joinLeague(input: JoinLeagueInput): Promise<JoinLeagueResult>;
  listMembers(leagueId: string): Promise<LeagueMember[]>;
  /** Every league the user holds an active seat in. */
  listLeaguesForUser(userId: string): Promise<UserLeague[]>;
  /** The user's seat in one league, or null when they are not a member. */
  getMemberForUser(
    leagueId: string,
    userId: string,
  ): Promise<LeagueMember | null>;
  /** Soft-deactivate or reactivate a member. Blocks deactivating the last admin. */
  setMemberActive(
    leagueId: string,
    memberId: string,
    active: boolean,
  ): Promise<LeagueMember>;
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

  /** Ensure nfl_weeks row exists for season/week. */
  ensureWeek(input: {
    season: number;
    week: number;
    start_date: string;
    end_date: string;
    label?: string;
  }): Promise<NflWeek>;

  /** Upsert games for a week from provider payloads; returns external_game_id → id. */
  upsertGamesForWeek(
    weekId: string,
    games: import("@/lib/providers/types").ProviderGame[],
  ): Promise<Map<string, string>>;

  /** Upsert NFL players; returns external_player_id → id. */
  upsertPlayers(
    players: import("@/lib/providers/types").ProviderPlayer[],
  ): Promise<Map<string, string>>;

  /**
   * Replace the ranked board for a week (deletes prior rows for that week first).
   * Needed so scoring-rule changes don't leave stale QBs / duplicate ranks.
   */
  replacePlayerWeekBoard(
    weekId: string,
    rows: Array<{
      player_id: string;
      game_id: string;
      market_probability: number;
      our_probability: number;
      td_pool_score: number;
      td_pool_rank: number;
      matchup_rating: number;
      goal_line_rating: number;
      research_json: import("@/lib/types").ResearchJson;
      injury_status: import("@/lib/types").InjuryStatus;
      availability: import("@/lib/types").PlayerAvailability;
      tier: import("@/lib/types").TdTier;
      consensus_american_odds: number;
      consensus_decimal_odds: number;
    }>,
  ): Promise<number>;

  /**
   * Board size without loading research payloads. Read on every request to
   * decide whether a rebuild is needed, so it must stay cheap.
   */
  countPlayerWeekRows(weekId: string): Promise<number>;

  /** Read a shared refresh timestamp. Null when the job has never run. */
  getSyncState(key: string): Promise<SyncStateRow | null>;

  /**
   * Claim a refresh slot. Returns false when another instance ran the job
   * within `ttlMs`, so callers can skip duplicate provider work.
   */
  claimSyncSlot(key: string, ttlMs: number): Promise<boolean>;

  /** Record the outcome of a refresh so other instances can throttle on it. */
  completeSyncSlot(
    key: string,
    status: "ok" | "error",
    detail?: Record<string, unknown>,
  ): Promise<void>;
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
