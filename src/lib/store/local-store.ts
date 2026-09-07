import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { buildSeedPayload, type SeedPayload } from "@/data/mock/seed-league";
import {
  americanToDecimal,
  calculateWeeklyStake,
  combineParlayDecimal,
  decimalToAmerican,
  estimatePayout,
} from "@/lib/utils/odds";
import { slugify } from "@/lib/utils/slug";
import { StoreError, type Store, type GameStatusUpdate, type PickResultUpdate, type ApplyOddsRefreshInput } from "@/lib/store/types";
import type {
  CreateLeagueInput,
  League,
  LeagueDashboard,
  LeagueMember,
  MemberPickStatus,
  NflGame,
  NflPlayer,
  NflWeek,
  ParlaySummary,
  Pick,
  PlayerWeekData,
  SelectPickInput,
  UpdateLeagueSettingsInput,
} from "@/lib/types";

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

      // Reuse active week from seed if present; otherwise create a placeholder week.
      let week = data.weeks.find((w) => w.season === 2025 && w.week === 4);
      if (!week) {
        week = {
          id: newId("week"),
          season: 2025,
          week: 4,
          start_date: "2025-09-24",
          end_date: "2025-09-30",
          label: "NFL Week 4",
        };
        data.weeks.push(week);
      }

      const league: League = {
        id: newId("league"),
        name: input.name.trim(),
        slug,
        admin_user_id: null,
        currency: input.currency ?? "USD",
        betting_mode: input.betting_mode ?? "individual",
        contribution_per_member: input.contribution_per_member ?? 10,
        fixed_weekly_stake: input.fixed_weekly_stake ?? null,
        pick_lock_type: input.pick_lock_type ?? "individual_game",
        pick_deadline_at: input.pick_deadline_at ?? null,
        allow_pick_changes: input.allow_pick_changes ?? true,
        odds_format: input.odds_format ?? "american",
        survivor_mode: input.survivor_mode ?? false,
        admin_pin: input.admin_pin,
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
          user_id: null,
          display_name: name,
          role: name === input.admin_display_name ? "admin" : "member",
          active: true,
          pin: name === input.admin_display_name ? input.admin_pin : null,
          created_at: createdAt,
        };
        data.members.push(member);
      }

      return league;
    });
  }

  async listMembers(leagueId: string): Promise<LeagueMember[]> {
    return this.withRead((data) =>
      data.members.filter((m) => m.league_id === leagueId && m.active),
    );
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

    // Release previous player if changing / overriding.
    if (existingMemberPick && existingMemberPick.player_id !== input.player_id) {
      const previousPwd = data.player_week_data.find(
        (p) =>
          p.player_id === existingMemberPick.player_id &&
          p.week_id === input.week_id,
      );
      if (previousPwd && previousPwd.availability === "taken") {
        previousPwd.availability =
          previousPwd.injury_status === "questionable" ||
          previousPwd.injury_status === "doubtful"
            ? "questionable"
            : previousPwd.injury_status === "out" ||
                previousPwd.injury_status === "injured_reserve"
              ? "injured"
              : "available";
      }
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

    pwd.availability = "taken";

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
      for (const row of input.consensus) {
        const player = playersByExternal.get(row.external_player_id);
        if (!player) continue;
        const pwd = data.player_week_data.find(
          (p) => p.week_id === input.weekId && p.player_id === player.id,
        );
        if (!pwd) continue;

        pwd.consensus_american_odds = row.american_odds;
        pwd.consensus_decimal_odds = row.decimal_odds;
        pwd.market_probability = row.implied_probability;
        pwd.research_json = {
          ...pwd.research_json,
          market: {
            consensus_american: row.american_odds,
            consensus_implied: row.implied_probability,
            books: row.books.map((b) => ({
              sportsbook: b.sportsbook,
              american_odds: b.american_odds,
            })),
          },
        };
        pwd.updated_at = fetchedAt;
        playersUpdated += 1;
      }

      return playersUpdated;
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
        (p) => p.league_id === league.id && p.week_id === week.id,
      );
      const pickByMember = new Map(picks.map((p) => [p.member_id, p]));
      const takenByPlayer = new Map(
        picks.map((p) => {
          const member = members.find((m) => m.id === p.member_id);
          return [p.player_id, member?.display_name ?? "Unknown"] as const;
        }),
      );

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
      const decimalLegs = picks.map((p) => {
        const pwd = data.player_week_data.find(
          (row) => row.player_id === p.player_id && row.week_id === week.id,
        );
        if (pwd) return pwd.consensus_decimal_odds;
        return americanToDecimal(p.odds_at_selection);
      });

      let parlay: ParlaySummary = {
        picks_submitted: picks.length,
        picks_total: members.length,
        stake,
        combined_decimal: null,
        combined_american: null,
        estimated_payout: null,
        estimated_profit: null,
        currency: league.currency,
        betting_mode: league.betting_mode,
      };

      if (decimalLegs.length > 0 && league.betting_mode !== "none") {
        const combined = combineParlayDecimal(decimalLegs);
        const { payout, profit } = estimatePayout(stake, combined);
        parlay = {
          ...parlay,
          combined_decimal: Number(combined.toFixed(4)),
          combined_american: decimalToAmerican(combined),
          estimated_payout: Number(payout.toFixed(2)),
          estimated_profit: Number(profit.toFixed(2)),
        };
      } else if (decimalLegs.length > 0) {
        const combined = combineParlayDecimal(decimalLegs);
        parlay = {
          ...parlay,
          combined_decimal: Number(combined.toFixed(4)),
          combined_american: decimalToAmerican(combined),
        };
      }

      const ranked_players = data.player_week_data
        .filter((pwd) => pwd.week_id === week.id)
        .sort((a, b) => a.td_pool_rank - b.td_pool_rank)
        .map((pwd) => {
          const player = playersById.get(pwd.player_id);
          const game = gamesById.get(pwd.game_id);
          if (!player || !game) return null;
          const gameStarted =
            game.status === "in_progress" || game.status === "final";
          let availability = takenByPlayer.has(pwd.player_id)
            ? ("taken" as const)
            : pwd.availability;
          // Individual-game lock: once a player's game has started (after sync),
          // mark remaining open slots as locked so they can't be newly picked.
          if (
            availability !== "taken" &&
            league.pick_lock_type === "individual_game" &&
            gameStarted
          ) {
            availability = "locked";
          }
          return {
            ...pwd,
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
