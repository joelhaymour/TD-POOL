import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { buildSeedPayload, type SeedPayload } from "@/data/mock/seed-league";
import {
  calculateWeeklyStake,
  decimalOddsForLeg,
  parlayCombinedFields,
} from "@/lib/utils/odds";
import { mockToLivePlayerMoves } from "@/lib/providers/the-odds-api/maps";
import { slugify } from "@/lib/utils/slug";
import { resolvePoolWeek, weekWindow } from "@/lib/nfl/calendar";
import { playerWeekRankKey } from "@/lib/scoring/rank";
import {
  featuresFromResearch,
  recomputePlayerAgainstCohort,
} from "@/lib/model/recompute-with-market";
import { StoreError, type Store, type GameStatusUpdate, type PickResultUpdate, type ApplyOddsRefreshInput, type JoinLeagueInput, type JoinLeagueResult, type SyncStateRow, type UserLeague, type SyncSlotStatus, effectiveSyncTtl } from "@/lib/store/types";
import type {
  CreateLeagueInput,
  League,
  LeagueDashboard,
  LeagueMember,
  MemberPickStatus,
  MemberRole,
  NflGame,
  NflPlayer,
  NflWeek,
  ParlaySummary,
  Pick,
  PlayerWeekData,
  SelectPickInput,
  UpdateLeagueSettingsInput,
} from "@/lib/types";

import {
  availabilityForLeague,
  takenByActiveMembers,
} from "@/lib/league/availability";
import { consensusImpliedFromAmericans } from "@/lib/model/math";

const STORE_PATH = path.join(process.cwd(), ".data", "store.json");

type StoreData = SeedPayload;

function emptyStore(): StoreData {
  return {
    leagues: [],
    members: [],
    weeks: [],
    games: [],
    players: [],
    player_week_data: [],
    player_odds: [],
    picks: [],
  };
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Simple promise-chain mutex for read-modify-write safety across async callers.
 */
class Mutex {
  private chain: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export class LocalFileStore implements Store {
  private mutex = new Mutex();
  private initialized = false;
  /** Dev store runs in a single process, so in-memory sync state is enough. */
  private syncState = new Map<string, SyncStateRow>();

  private async ensureReady(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    try {
      const raw = await fs.readFile(STORE_PATH, "utf8");
      const parsed = JSON.parse(raw) as StoreData;
      if (!parsed.leagues?.length) {
        await this.seedAndWrite();
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        await this.seedAndWrite();
      } else {
        throw err;
      }
    }
    this.initialized = true;
  }

  private async seedAndWrite(): Promise<void> {
    const seeded = await buildSeedPayload();
    await this.write(seeded);
  }

  private async read(): Promise<StoreData> {
    await this.ensureReady();
    try {
      const raw = await fs.readFile(STORE_PATH, "utf8");
      return JSON.parse(raw) as StoreData;
    } catch {
      return emptyStore();
    }
  }

  private async write(data: StoreData): Promise<void> {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    const tmp = `${STORE_PATH}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, STORE_PATH);
  }

  private async withData<T>(
    fn: (data: StoreData) => Promise<T> | T,
  ): Promise<T> {
    return this.mutex.run(async () => {
      const data = await this.read();
      const result = await fn(data);
      await this.write(data);
      return result;
    });
  }

  private async withRead<T>(fn: (data: StoreData) => Promise<T> | T): Promise<T> {
    return this.mutex.run(async () => {
      const data = await this.read();
      return fn(data);
    });
  }

  async getLeagueBySlug(slug: string): Promise<League | null> {
    return this.withRead((data) => {
      return data.leagues.find((l) => l.slug === slug) ?? null;
    });
  }

  async createLeague(input: CreateLeagueInput): Promise<League> {
    return this.withData((data) => {
      const slug = slugify(input.slug ?? input.name);
      if (!slug) {
        throw new StoreError("League name produces an empty slug", "VALIDATION");
      }
      if (data.leagues.some((l) => l.slug === slug)) {
        throw new StoreError(`Slug "${slug}" is already taken`, "CONFLICT");
      }

      const createdAt = nowIso();
      const memberNames =
        input.member_names && input.member_names.length > 0
          ? input.member_names
          : [input.admin_display_name];

      if (!memberNames.includes(input.admin_display_name)) {
        memberNames.unshift(input.admin_display_name);
      }

      const memberCount = input.member_count ?? memberNames.length;

      const pool = resolvePoolWeek(new Date());
      const window = weekWindow(pool.season, pool.week);
      let week = data.weeks.find(
        (w) => w.season === pool.season && w.week === pool.week,
      );
      if (!week) {
        week = {
          id: newId("week"),
          season: pool.season,
          week: pool.week,
          start_date: window.start_date,
          end_date: window.end_date,
          label: window.label,
        };
        data.weeks.push(week);
      }

      const league: League = {
        id: newId("league"),
        name: input.name.trim(),
        slug,
        admin_user_id: input.admin_user_id ?? null,
        league_type: input.league_type ?? "td_pool",
        max_props_per_member: input.max_props_per_member ?? 3,
        currency: input.currency ?? "USD",
        betting_mode: input.betting_mode ?? "individual",
        contribution_per_member: input.contribution_per_member ?? 10,
        fixed_weekly_stake: input.fixed_weekly_stake ?? null,
        pick_lock_type: input.pick_lock_type ?? "individual_game",
        pick_deadline_at: input.pick_deadline_at ?? null,
        allow_pick_changes: input.allow_pick_changes ?? true,
        odds_format: input.odds_format ?? "american",
        survivor_mode: input.survivor_mode ?? false,
        join_pin: input.join_pin,
        logo_url: input.logo_url ?? null,
        active_week_id: week.id,
        member_count: memberCount,
        created_at: createdAt,
        updated_at: createdAt,
      };

      data.leagues.push(league);

      for (let i = 0; i < memberNames.length; i += 1) {
        const name = memberNames[i];
        const member: LeagueMember = {
          id: newId("member"),
          league_id: league.id,
          user_id:
            name === input.admin_display_name
              ? (input.admin_user_id ?? null)
              : null,
          display_name: name,
          role: name === input.admin_display_name ? "admin" : "member",
          active: true,
          created_at: createdAt,
        };
        data.members.push(member);
      }

      return league;
    });
  }

  async joinLeague(input: JoinLeagueInput): Promise<JoinLeagueResult> {
    return this.withData((data) => {
      const slug = input.slug.trim().toLowerCase();
      const displayName = input.display_name.trim();
      const joinPin = input.join_pin.trim();

      if (!displayName) {
        throw new StoreError("Display name is required", "VALIDATION");
      }
      if (!joinPin) {
        throw new StoreError("Join PIN is required", "VALIDATION");
      }

      const league = data.leagues.find((l) => l.slug === slug);
      if (!league) throw new StoreError("League not found", "NOT_FOUND");
      if (league.join_pin !== joinPin) {
        throw new StoreError("Invalid join PIN", "FORBIDDEN");
      }

      const userId = input.user_id ?? null;
      if (userId) {
        const owned = data.members.find(
          (m) => m.league_id === league.id && m.user_id === userId && m.active,
        );
        if (owned) return { league, member: owned };
      }

      const existing = data.members.find(
        (m) =>
          m.league_id === league.id &&
          m.display_name.toLowerCase() === displayName.toLowerCase(),
      );

      if (existing) {
        if (existing.active && existing.user_id) {
          throw new StoreError(
            "That display name is already taken in this league",
            "CONFLICT",
          );
        }
        existing.active = true;
        existing.user_id = userId;
        return { league, member: existing };
      }

      const member: LeagueMember = {
        id: newId("member"),
        league_id: league.id,
        user_id: userId,
        display_name: displayName,
        role: "member",
        active: true,
        created_at: nowIso(),
      };
      data.members.push(member);
      league.member_count = data.members.filter(
        (m) => m.league_id === league.id && m.active,
      ).length;
      league.updated_at = nowIso();
      return { league, member };
    });
  }

  async setMemberActive(
    leagueId: string,
    memberId: string,
    active: boolean,
  ): Promise<LeagueMember> {
    return this.withData((data) => {
      const member = data.members.find(
        (m) => m.id === memberId && m.league_id === leagueId,
      );
      if (!member) throw new StoreError("Member not found", "NOT_FOUND");

      if (!active && member.role === "admin") {
        const otherAdmins = data.members.filter(
          (m) =>
            m.league_id === leagueId &&
            m.active &&
            m.role === "admin" &&
            m.id !== memberId,
        );
        if (otherAdmins.length === 0) {
          throw new StoreError(
            "Cannot remove the last admin from the league",
            "FORBIDDEN",
          );
        }
      }

      member.active = active;
      const league = data.leagues.find((l) => l.id === leagueId);
      if (league) {
        league.member_count = data.members.filter(
          (m) => m.league_id === leagueId && m.active,
        ).length;
        league.updated_at = nowIso();
      }
      return member;
    });
  }

  async listMembers(leagueId: string): Promise<LeagueMember[]> {
    return this.withRead((data) =>
      data.members.filter((m) => m.league_id === leagueId && m.active),
    );
  }

  async listLeaguesForUser(userId: string): Promise<UserLeague[]> {
    return this.withRead((data) =>
      data.members
        .filter((m) => m.user_id === userId && m.active)
        .flatMap((member) => {
          const league = data.leagues.find((l) => l.id === member.league_id);
          return league ? [{ league, member }] : [];
        })
        .sort((a, b) => a.league.name.localeCompare(b.league.name)),
    );
  }

  async getMemberForUser(
    leagueId: string,
    userId: string,
  ): Promise<LeagueMember | null> {
    return this.withRead(
      (data) =>
        data.members.find(
          (m) => m.league_id === leagueId && m.user_id === userId && m.active,
        ) ?? null,
    );
  }

  async setMemberRole(
    leagueId: string,
    memberId: string,
    role: MemberRole,
  ): Promise<LeagueMember> {
    return this.withData((data) => {
      const member = data.members.find(
        (m) => m.id === memberId && m.league_id === leagueId,
      );
      if (!member) throw new StoreError("Member not found", "NOT_FOUND");

      if (role !== "admin" && member.role === "admin") {
        const otherAdmins = data.members.filter(
          (m) =>
            m.league_id === leagueId &&
            m.active &&
            m.role === "admin" &&
            m.id !== memberId,
        );
        if (otherAdmins.length === 0) {
          throw new StoreError(
            "Promote someone else before stepping down as the last admin",
            "FORBIDDEN",
          );
        }
      }

      member.role = role;
      return member;
    });
  }

  async getPicksForWeek(leagueId: string, weekId: string): Promise<Pick[]> {
    return this.withRead((data) =>
      data.picks.filter((p) => p.league_id === leagueId && p.week_id === weekId),
    );
  }

  async getPlayerWeekData(weekId: string): Promise<PlayerWeekData[]> {
    return this.withRead((data) =>
      data.player_week_data
        .filter((p) => p.week_id === weekId)
        .sort((a, b) => a.td_pool_rank - b.td_pool_rank),
    );
  }

  async submitPick(input: SelectPickInput): Promise<Pick> {
    return this.withData((data) => this.applyPick(data, input, "submit"));
  }

  async changePick(input: SelectPickInput): Promise<Pick> {
    return this.withData((data) => this.applyPick(data, input, "change"));
  }

  async overridePick(input: SelectPickInput): Promise<Pick> {
    return this.withData((data) => this.applyPick(data, input, "override"));
  }

  private applyPick(
    data: StoreData,
    input: SelectPickInput,
    mode: "submit" | "change" | "override",
  ): Pick {
    const league = data.leagues.find((l) => l.id === input.league_id);
    if (!league) throw new StoreError("League not found", "NOT_FOUND");

    const member = data.members.find(
      (m) => m.id === input.member_id && m.league_id === input.league_id,
    );
    if (!member || !member.active) {
      throw new StoreError("Member not found", "NOT_FOUND");
    }

    const pwd = data.player_week_data.find(
      (p) => p.player_id === input.player_id && p.week_id === input.week_id,
    );
    if (!pwd) {
      throw new StoreError("Player not available for this week", "NOT_FOUND");
    }

    const game = data.games.find((g) => g.id === pwd.game_id);
    if (
      mode !== "override" &&
      league.pick_lock_type === "individual_game" &&
      game &&
      (game.status === "in_progress" || game.status === "final")
    ) {
      throw new StoreError(
        "This player's game has already started",
        "LOCKED",
      );
    }

    const existingMemberPick = data.picks.find(
      (p) =>
        p.league_id === input.league_id &&
        p.week_id === input.week_id &&
        p.member_id === input.member_id,
    );

    if (mode === "submit" && existingMemberPick) {
      throw new StoreError(
        "Member already has a pick for this week — use changePick",
        "CONFLICT",
      );
    }

    if (mode === "change") {
      if (!existingMemberPick) {
        throw new StoreError("No existing pick to change", "NOT_FOUND");
      }
      if (!league.allow_pick_changes) {
        throw new StoreError("Pick changes are disabled", "FORBIDDEN");
      }
    }

    const conflictingPlayerPick = data.picks.find(
      (p) =>
        p.league_id === input.league_id &&
        p.week_id === input.week_id &&
        p.player_id === input.player_id &&
        p.member_id !== input.member_id,
    );
    if (conflictingPlayerPick) {
      throw new StoreError(
        "Player already selected by another member this week",
        "CONFLICT",
      );
    }

    if (existingMemberPick && existingMemberPick.player_id !== input.player_id) {
      const idx = data.picks.findIndex((p) => p.id === existingMemberPick.id);
      if (idx >= 0) data.picks.splice(idx, 1);
    }

    if (
      existingMemberPick &&
      existingMemberPick.player_id === input.player_id &&
      mode !== "override"
    ) {
      return existingMemberPick;
    }

    const pick: Pick = {
      id: existingMemberPick?.id ?? newId("pick"),
      league_id: input.league_id,
      member_id: input.member_id,
      week_id: input.week_id,
      player_id: input.player_id,
      odds_at_selection: pwd.consensus_american_odds,
      probability_at_selection: pwd.market_probability,
      picked_at: nowIso(),
      result: "pending",
      touchdown_scored: null,
      overridden: mode === "override",
    };

    data.picks.push(pick);
    return pick;
  }

  async updateLeagueSettings(
    leagueId: string,
    settings: UpdateLeagueSettingsInput,
  ): Promise<League> {
    return this.withData((data) => {
      const league = data.leagues.find((l) => l.id === leagueId);
      if (!league) throw new StoreError("League not found", "NOT_FOUND");

      Object.assign(league, {
        ...settings,
        updated_at: nowIso(),
      });
      return league;
    });
  }

  async getWeekBySeasonWeek(
    season: number,
    week: number,
  ): Promise<NflWeek | null> {
    return this.withRead(
      (data) =>
        data.weeks.find((w) => w.season === season && w.week === week) ?? null,
    );
  }

  async listWeeks(): Promise<NflWeek[]> {
    return this.withRead((data) =>
      [...data.weeks].sort((a, b) =>
        a.season !== b.season ? a.season - b.season : a.week - b.week,
      ),
    );
  }

  async listGamesForWeek(weekId: string): Promise<NflGame[]> {
    return this.withRead((data) =>
      data.games.filter((g) => g.week_id === weekId),
    );
  }

  async listPlayers(): Promise<NflPlayer[]> {
    return this.withRead((data) => [...data.players]);
  }

  async listLeagues(): Promise<League[]> {
    return this.withRead((data) => [...data.leagues]);
  }

  async updateGameStatuses(updates: GameStatusUpdate[]): Promise<number> {
    if (updates.length === 0) return 0;
    return this.withData((data) => {
      let changed = 0;
      for (const update of updates) {
        const game = data.games.find((g) => g.id === update.id);
        if (!game) continue;
        game.status = update.status;
        game.home_score = update.home_score;
        game.away_score = update.away_score;
        changed += 1;
      }
      return changed;
    });
  }

  async resolvePickResults(updates: PickResultUpdate[]): Promise<number> {
    if (updates.length === 0) return 0;
    return this.withData((data) => {
      let changed = 0;
      for (const update of updates) {
        const pick = data.picks.find((p) => p.id === update.pickId);
        if (!pick) continue;
        pick.result = update.result;
        pick.touchdown_scored = update.touchdown_scored;
        changed += 1;
      }
      return changed;
    });
  }

  async applyOddsRefresh(input: ApplyOddsRefreshInput): Promise<number> {
    return this.withData((data) => {
      const playersByExternal = new Map(
        data.players
          .filter((p) => p.external_player_id)
          .map((p) => [p.external_player_id!, p] as const),
      );
      const gamesByExternal = new Map(
        data.games
          .filter((g) => g.external_game_id)
          .map((g) => [g.external_game_id!, g] as const),
      );

      const fetchedAt =
        input.quotes[0]?.fetched_at ??
        input.consensus[0]?.fetched_at ??
        nowIso();

      // Replace odds rows for this week
      data.player_odds = data.player_odds.filter((o) => o.week_id !== input.weekId);

      for (const quote of input.quotes) {
        const player = playersByExternal.get(quote.external_player_id);
        if (!player) continue;
        const game =
          gamesByExternal.get(quote.external_game_id) ??
          data.games.find(
            (g) =>
              g.week_id === input.weekId &&
              data.player_week_data.some(
                (pwd) =>
                  pwd.week_id === input.weekId &&
                  pwd.player_id === player.id &&
                  pwd.game_id === g.id,
              ),
          );
        if (!game) continue;

        data.player_odds.push({
          id: newId("odds"),
          player_id: player.id,
          game_id: game.id,
          week_id: input.weekId,
          sportsbook: quote.sportsbook,
          market: quote.market,
          american_odds: quote.american_odds,
          decimal_odds: quote.decimal_odds,
          implied_probability: quote.implied_probability,
          fetched_at: quote.fetched_at || fetchedAt,
        });
      }

      let playersUpdated = 0;
      const marketByPlayerId = new Map<
        string,
        {
          american_odds: number;
          decimal_odds: number;
          implied_probability: number;
          books: Array<{ sportsbook: string; american_odds: number }>;
        }
      >();

      for (const row of input.consensus) {
        const player = playersByExternal.get(row.external_player_id);
        if (!player) continue;
        marketByPlayerId.set(player.id, {
          american_odds: row.american_odds,
          decimal_odds: row.decimal_odds,
          implied_probability: row.implied_probability,
          books: row.books.map((b) => ({
            sportsbook: b.sportsbook,
            american_odds: b.american_odds,
          })),
        });
      }

      const weekRows = data.player_week_data.filter(
        (p) => p.week_id === input.weekId,
      );

      const cohort = weekRows
        .map((pwd) => {
          const base = featuresFromResearch(pwd.research_json);
          if (!base) return null;
          const market = marketByPlayerId.get(pwd.player_id);
          if (!market) return base;
          return {
            ...base,
            marketConsensusProbability: market.implied_probability,
            consensusAnytimeTdOdds: market.american_odds,
            bestAnytimeTdOdds: market.american_odds,
            marketBooks: market.books.length,
          };
        })
        .filter((f): f is NonNullable<typeof f> => f != null);

      for (const pwd of weekRows) {
        const market = marketByPlayerId.get(pwd.player_id);
        if (market) {
          pwd.consensus_american_odds = market.american_odds;
          pwd.consensus_decimal_odds = market.decimal_odds;
          pwd.market_probability = market.implied_probability;
          pwd.research_json = {
            ...pwd.research_json,
            market: {
              consensus_american: market.american_odds,
              consensus_implied: market.implied_probability,
              books: market.books,
            },
          };
          playersUpdated += 1;
        }

        const base = featuresFromResearch(pwd.research_json);
        if (!base || !cohort.length) continue;
        const features = market
          ? {
              ...base,
              marketConsensusProbability: market.implied_probability,
              consensusAnytimeTdOdds: market.american_odds,
              bestAnytimeTdOdds: market.american_odds,
              marketBooks: market.books.length,
            }
          : base;
        const recomputed = recomputePlayerAgainstCohort({
          research: pwd.research_json,
          features,
          cohort,
        });
        pwd.our_probability = recomputed.our_probability;
        pwd.td_pool_score = recomputed.td_pool_score;
        pwd.matchup_rating = recomputed.matchup_rating;
        pwd.goal_line_rating = recomputed.goal_line_rating;
        pwd.tier = recomputed.tier;
        pwd.research_json = recomputed.research_json;
        pwd.updated_at = fetchedAt;
      }

      // Re-rank so market favorites rise by TD Pool %.
      data.player_week_data
        .filter((p) => p.week_id === input.weekId)
        .sort((a, b) => playerWeekRankKey(b) - playerWeekRankKey(a))
        .forEach((row, index) => {
          row.td_pool_rank = index + 1;
        });

      return playersUpdated;
    });
  }

  async ensureWeek(input: {
    season: number;
    week: number;
    start_date: string;
    end_date: string;
    label?: string;
  }): Promise<NflWeek> {
    return this.withData((data) => {
      const existing = data.weeks.find(
        (w) => w.season === input.season && w.week === input.week,
      );
      if (existing) {
        existing.start_date = input.start_date;
        existing.end_date = input.end_date;
        if (input.label) existing.label = input.label;
        return existing;
      }
      const week: NflWeek = {
        id: newId("week"),
        season: input.season,
        week: input.week,
        start_date: input.start_date,
        end_date: input.end_date,
        label: input.label ?? `NFL Week ${input.week}`,
      };
      data.weeks.push(week);
      return week;
    });
  }

  async upsertGamesForWeek(
    weekId: string,
    games: import("@/lib/providers/types").ProviderGame[],
  ): Promise<Map<string, string>> {
    return this.withData((data) => {
      const map = new Map<string, string>();
      for (const g of games) {
        const existing = data.games.find(
          (row) =>
            row.week_id === weekId &&
            (row.external_game_id === g.external_game_id ||
              (row.home_team === g.home_team && row.away_team === g.away_team)),
        );
        if (existing) {
          existing.external_game_id = g.external_game_id;
          existing.kickoff_at = g.kickoff_at;
          existing.status = g.status;
          existing.spread = g.spread;
          existing.total = g.total;
          existing.home_score = g.home_score;
          existing.away_score = g.away_score;
          existing.stadium = g.stadium;
          existing.is_dome = g.is_dome;
          map.set(g.external_game_id, existing.id);
          continue;
        }
        const id = newId("game");
        data.games.push({
          id,
          week_id: weekId,
          external_game_id: g.external_game_id,
          home_team: g.home_team,
          away_team: g.away_team,
          kickoff_at: g.kickoff_at,
          status: g.status,
          spread: g.spread,
          total: g.total,
          home_score: g.home_score,
          away_score: g.away_score,
          stadium: g.stadium,
          is_dome: g.is_dome,
        });
        map.set(g.external_game_id, id);
      }
      return map;
    });
  }

  async upsertPlayers(
    players: import("@/lib/providers/types").ProviderPlayer[],
  ): Promise<Map<string, string>> {
    return this.withData((data) => {
      const map = new Map<string, string>();
      for (const p of players) {
        const existing = data.players.find(
          (row) =>
            row.external_player_id === p.external_player_id ||
            (row.name.toLowerCase() === p.name.toLowerCase() &&
              row.team === p.team),
        );
        if (existing) {
          existing.external_player_id = p.external_player_id;
          existing.name = p.name;
          existing.team = p.team;
          existing.position = p.position;
          existing.active = p.active;
          existing.jersey_number = p.jersey_number;
          existing.headshot_url = p.headshot_url;
          map.set(p.external_player_id, existing.id);
          continue;
        }
        const id = newId("player");
        data.players.push({
          id,
          external_player_id: p.external_player_id,
          name: p.name,
          team: p.team,
          position: p.position,
          active: p.active,
          jersey_number: p.jersey_number,
          headshot_url: p.headshot_url,
        });
        map.set(p.external_player_id, id);
      }
      return map;
    });
  }

  async reapplyStoredOdds(weekId: string): Promise<number> {
    return this.withData((data) => {
      const moves = mockToLivePlayerMoves(data.players);
      const gameByPlayer = new Map(
        data.player_week_data
          .filter((row) => row.week_id === weekId)
          .map((row) => [row.player_id, row.game_id]),
      );
      for (const move of moves) {
        for (const quote of data.player_odds) {
          if (quote.week_id !== weekId || quote.player_id !== move.fromId) {
            continue;
          }
          quote.player_id = move.toId;
          const gameId = gameByPlayer.get(move.toId);
          if (gameId) quote.game_id = gameId;
        }
      }

      const byPlayer = new Map<string, number[]>();
      const booksByPlayer = new Map<
        string,
        Array<{ sportsbook: string; american_odds: number }>
      >();
      for (const q of data.player_odds) {
        if (q.week_id !== weekId || !q.american_odds) continue;
        const list = byPlayer.get(q.player_id) ?? [];
        list.push(q.american_odds);
        byPlayer.set(q.player_id, list);
        const books = booksByPlayer.get(q.player_id) ?? [];
        books.push({ sportsbook: q.sportsbook, american_odds: q.american_odds });
        booksByPlayer.set(q.player_id, books);
      }

      let updated = 0;
      for (const pwd of data.player_week_data) {
        if (pwd.week_id !== weekId) continue;
        const americans = byPlayer.get(pwd.player_id);
        if (!americans?.length) continue;
        const agg = consensusImpliedFromAmericans(americans);
        if (!agg) continue;
        pwd.consensus_american_odds = agg.american;
        pwd.consensus_decimal_odds = agg.decimal;
        pwd.market_probability = agg.implied;
        pwd.research_json = {
          ...pwd.research_json,
          market: {
            consensus_american: agg.american,
            consensus_implied: agg.implied,
            books: booksByPlayer.get(pwd.player_id) ?? [],
          },
        };
        updated += 1;
      }
      return updated;
    });
  }

  async replacePlayerWeekBoard(
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
  ): Promise<number> {
    return this.withData((data) => {
      const prior = new Map(
        data.player_week_data
          .filter((p) => p.week_id === weekId)
          .map((p) => [p.player_id, p] as const),
      );
      data.player_week_data = data.player_week_data.filter(
        (p) => p.week_id !== weekId,
      );
      const now = nowIso();
      for (const row of rows) {
        const kept = prior.get(row.player_id);
        const hasNewOdds = row.consensus_american_odds !== 0;
        data.player_week_data.push({
          id: newId("pwd"),
          week_id: weekId,
          updated_at: now,
          ...row,
          consensus_american_odds: hasNewOdds
            ? row.consensus_american_odds
            : (kept?.consensus_american_odds ?? 0),
          consensus_decimal_odds: hasNewOdds
            ? row.consensus_decimal_odds
            : (kept?.consensus_decimal_odds ?? 0),
          market_probability: hasNewOdds
            ? row.market_probability
            : (kept?.market_probability ?? row.market_probability),
          research_json: {
            ...row.research_json,
            market:
              hasNewOdds || !kept?.research_json.market?.consensus_american
                ? row.research_json.market
                : kept.research_json.market,
          },
        });
      }
      return rows.length;
    });
  }

  async countPlayerWeekRows(weekId: string): Promise<number> {
    return this.withRead(
      (data) =>
        data.player_week_data.filter((p) => p.week_id === weekId).length,
    );
  }

  // --- Group betting: hosted-DB only. USE_SUPABASE=true is required. -------

  private groupBettingUnavailable(): never {
    throw new StoreError(
      "Group betting requires the hosted database (set USE_SUPABASE=true)",
      "VALIDATION",
    );
  }

  async getGameById(gameId: string) {
    const db = await this.read();
    return db.games.find((g) => g.id === gameId) ?? null;
  }

  async replaceGameProps(): Promise<number> {
    this.groupBettingUnavailable();
  }
  async listGameProps(): Promise<import("@/lib/types").GameProp[]> {
    this.groupBettingUnavailable();
  }
  async getGameProp(): Promise<import("@/lib/types").GameProp | null> {
    this.groupBettingUnavailable();
  }
  async createParlay(): Promise<import("@/lib/types").Parlay> {
    this.groupBettingUnavailable();
  }
  async listParlaysForLeague(): Promise<import("@/lib/types").ParlayWithLegs[]> {
    this.groupBettingUnavailable();
  }
  async getParlay(): Promise<import("@/lib/types").ParlayWithLegs | null> {
    this.groupBettingUnavailable();
  }
  async updateParlay(): Promise<import("@/lib/types").Parlay> {
    this.groupBettingUnavailable();
  }
  async gradeParlayLegs(): Promise<number> {
    this.groupBettingUnavailable();
  }
  async listGamesByIds(ids: string[]) {
    const db = await this.read();
    return db.games.filter((g) => ids.includes(g.id));
  }
  async deleteParlay(): Promise<void> {
    this.groupBettingUnavailable();
  }
  async addParlayLeg(): Promise<import("@/lib/types").ParlayLeg> {
    this.groupBettingUnavailable();
  }
  async removeParlayLeg(): Promise<import("@/lib/types").ParlayLeg | null> {
    this.groupBettingUnavailable();
  }

  async getSyncState(key: string): Promise<SyncStateRow | null> {
    return this.syncState.get(key) ?? null;
  }

  async claimSyncSlot(key: string, ttlMs: number): Promise<boolean> {
    const existing = this.syncState.get(key);
    if (existing) {
      const age = Date.now() - new Date(existing.last_run_at).getTime();
      if (Number.isFinite(age) && age < effectiveSyncTtl(existing, ttlMs)) {
        return false;
      }
    }
    this.syncState.set(key, {
      key,
      last_run_at: nowIso(),
      last_ok_at: existing?.last_ok_at ?? null,
      status: "running",
      detail: {},
    });
    return true;
  }

  async completeSyncSlot(
    key: string,
    status: SyncSlotStatus,
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    const existing = this.syncState.get(key);
    this.syncState.set(key, {
      key,
      last_run_at: nowIso(),
      last_ok_at: status !== "error" ? nowIso() : (existing?.last_ok_at ?? null),
      status,
      detail,
    });
  }

  /** Wipe and reseed the local JSON store (dev helper). */
  async reseed(): Promise<{ slug: string; leagueName: string }> {
    return this.mutex.run(async () => {
      const seeded = await buildSeedPayload();
      await this.write(seeded);
      this.initialized = true;
      const league = seeded.leagues[0];
      return {
        slug: league?.slug ?? "joels-league",
        leagueName: league?.name ?? "Sunday TD Club",
      };
    });
  }

  async getDashboard(slug: string): Promise<LeagueDashboard | null> {
    return this.withRead((data) => {
      const league = data.leagues.find((l) => l.slug === slug);
      if (!league || !league.active_week_id) return null;

      const week = data.weeks.find((w) => w.id === league.active_week_id);
      if (!week) return null;

      const members = data.members
        .filter((m) => m.league_id === league.id && m.active)
        .sort((a, b) => a.display_name.localeCompare(b.display_name));

      const picks = data.picks.filter(
        (p) =>
          p.league_id === league.id &&
          p.week_id === week.id &&
          members.some((m) => m.id === p.member_id),
      );
      const pickByMember = new Map(picks.map((p) => [p.member_id, p]));
      const takenByPlayer = takenByActiveMembers(picks, members);

      const playersById = new Map(data.players.map((p) => [p.id, p]));
      const gamesById = new Map(data.games.map((g) => [g.id, g]));

      const memberStatuses: MemberPickStatus[] = members.map((member) => {
        const pick = pickByMember.get(member.id) ?? null;
        const player = pick ? (playersById.get(pick.player_id) ?? null) : null;
        const player_week = pick
          ? (data.player_week_data.find(
              (pwd) =>
                pwd.player_id === pick.player_id && pwd.week_id === week.id,
            ) ?? null)
          : null;
        return { member, pick, player, player_week };
      });

      const stake = calculateWeeklyStake(league);
      const pwdForPick = (playerId: string) =>
        data.player_week_data.find(
          (row) => row.player_id === playerId && row.week_id === week.id,
        );
      const decimalLegs = picks.map((p) =>
        decimalOddsForLeg(
          pwdForPick(p.player_id)?.consensus_decimal_odds,
          p.odds_at_selection,
        ),
      );

      const parlay: ParlaySummary = {
        picks_submitted: picks.length,
        picks_total: members.length,
        stake,
        currency: league.currency,
        betting_mode: league.betting_mode,
        ...parlayCombinedFields(decimalLegs, stake, league.betting_mode),
      };

      const ranked_players = data.player_week_data
        .filter((pwd) => pwd.week_id === week.id)
        .sort((a, b) => playerWeekRankKey(b) - playerWeekRankKey(a))
        .map((pwd, index) => {
          const player = playersById.get(pwd.player_id);
          const game = gamesById.get(pwd.game_id);
          if (!player || !game) return null;
          const gameStarted =
            game.status === "in_progress" || game.status === "final";
          // player_week_data is shared by every league in the week, so a stored
          // "taken" belongs to some other league. Only this league's picks count.
          const takenHere = takenByPlayer.has(pwd.player_id);
          const availability = availabilityForLeague({
            takenHere,
            stored: pwd.availability,
            injury: pwd.injury_status,
            gameStarted,
            lockStartedGames: league.pick_lock_type === "individual_game",
          });
          return {
            ...pwd,
            td_pool_rank: index + 1,
            availability,
            player,
            game,
            taken_by: takenByPlayer.get(pwd.player_id) ?? null,
          };
        })
        .filter(
          (
            row,
          ): row is PlayerWeekData & {
            player: NflPlayer;
            game: NflGame;
            taken_by: string | null;
          } => row !== null,
        );

      const firstKickoff = data.games
        .filter((g) => g.week_id === week.id)
        .map((g) => g.kickoff_at)
        .sort()[0] ?? null;

      const pick_lock_at =
        league.pick_lock_type === "custom"
          ? league.pick_deadline_at
          : firstKickoff;

      const picks_locked = pick_lock_at
        ? Date.now() >= new Date(pick_lock_at).getTime() &&
          league.pick_lock_type !== "individual_game"
        : false;

      const oddsUpdated =
        data.player_odds
          .filter((o) => o.week_id === week.id)
          .map((o) => o.fetched_at)
          .sort()
          .at(-1) ?? null;

      return {
        league,
        week,
        members: memberStatuses,
        parlay,
        ranked_players,
        pick_lock_at,
        picks_locked,
        odds_updated_at: oddsUpdated,
      };
    });
  }
}

let singleton: LocalFileStore | null = null;

export function getLocalStore(): LocalFileStore {
  if (!singleton) {
    singleton = new LocalFileStore();
  }
  return singleton;
}
