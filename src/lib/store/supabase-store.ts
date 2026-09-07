import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  StoreError,
  type ApplyOddsRefreshInput,
  type GameStatusUpdate,
  type JoinLeagueInput,
  type JoinLeagueResult,
  type PickResultUpdate,
  type Store,
} from "@/lib/store/types";
import {
  americanToDecimal,
  calculateWeeklyStake,
  combineParlayDecimal,
  decimalToAmerican,
  estimatePayout,
} from "@/lib/utils/odds";
import { slugify } from "@/lib/utils/slug";
import { resolvePoolWeek, weekWindow } from "@/lib/nfl/calendar";
import { playerWeekRankKey } from "@/lib/scoring/rank";
import type {
  CreateLeagueInput,
  InjuryStatus,
  League,
  LeagueDashboard,
  LeagueMember,
  MemberPickStatus,
  NflGame,
  NflPlayer,
  NflWeek,
  ParlaySummary,
  Pick,
  PlayerAvailability,
  PlayerWeekData,
  ResearchJson,
  SelectPickInput,
  TdTier,
  UpdateLeagueSettingsInput,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function nowIso(): string {
  return new Date().toISOString();
}

function num(value: unknown, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "23505";
}

function injuryToDb(status: InjuryStatus): string {
  return status === "injured_reserve" ? "ir" : status;
}

function injuryFromDb(status: string | null | undefined): InjuryStatus {
  if (status === "ir") return "injured_reserve";
  if (
    status === "healthy" ||
    status === "questionable" ||
    status === "doubtful" ||
    status === "out" ||
    status === "injured_reserve"
  ) {
    return status;
  }
  return "healthy";
}

function availabilityFromInjury(status: InjuryStatus): PlayerAvailability {
  if (status === "out" || status === "injured_reserve") return "injured";
  if (status === "questionable" || status === "doubtful") return "questionable";
  return "available";
}

type DbLeague = Record<string, unknown>;
type DbMember = Record<string, unknown>;
type DbWeek = Record<string, unknown>;
type DbGame = Record<string, unknown>;
type DbPlayer = Record<string, unknown>;
type DbPwd = Record<string, unknown>;
type DbPick = Record<string, unknown>;

function mapLeague(row: DbLeague): League {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    admin_user_id: row.admin_user_id ? String(row.admin_user_id) : null,
    currency: (row.currency as League["currency"]) ?? "USD",
    betting_mode: (row.betting_mode as League["betting_mode"]) ?? "individual",
    contribution_per_member: numOrNull(row.contribution_per_member),
    fixed_weekly_stake: numOrNull(row.fixed_weekly_stake),
    pick_lock_type: (row.pick_lock_type as League["pick_lock_type"]) ?? "individual_game",
    pick_deadline_at: row.custom_lock_at ? String(row.custom_lock_at) : null,
    allow_pick_changes: Boolean(row.allow_pick_changes ?? true),
    odds_format: (row.odds_format as League["odds_format"]) ?? "american",
    survivor_mode: Boolean(row.survivor_mode ?? false),
    admin_pin: row.admin_pin != null ? String(row.admin_pin) : "",
    join_pin: row.join_pin != null ? String(row.join_pin) : "",
    logo_url: row.logo_url != null ? String(row.logo_url) : null,
    active_week_id: row.active_week_id ? String(row.active_week_id) : null,
    member_count: num(row.member_count_setting, 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapMember(row: DbMember): LeagueMember {
  return {
    id: String(row.id),
    league_id: String(row.league_id),
    user_id: row.user_id ? String(row.user_id) : null,
    display_name: String(row.display_name),
    role: (row.role as LeagueMember["role"]) ?? "member",
    active: Boolean(row.active ?? true),
    pin: row.pin != null ? String(row.pin) : null,
    created_at: String(row.created_at),
  };
}

function mapWeek(row: DbWeek): NflWeek {
  return {
    id: String(row.id),
    season: num(row.season),
    week: num(row.week),
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    label: row.label != null ? String(row.label) : undefined,
  };
}

function mapGame(row: DbGame): NflGame {
  return {
    id: String(row.id),
    week_id: String(row.week_id),
    external_game_id: row.external_game_id != null ? String(row.external_game_id) : null,
    home_team: String(row.home_team),
    away_team: String(row.away_team),
    kickoff_at: String(row.kickoff_at),
    status: (row.status as NflGame["status"]) ?? "scheduled",
    spread: numOrNull(row.spread),
    total: numOrNull(row.total),
    home_score: numOrNull(row.home_score),
    away_score: numOrNull(row.away_score),
    stadium: row.stadium != null ? String(row.stadium) : null,
    is_dome: Boolean(row.is_dome ?? false),
  };
}

function mapPlayer(row: DbPlayer): NflPlayer {
  return {
    id: String(row.id),
    external_player_id:
      row.external_player_id != null ? String(row.external_player_id) : null,
    name: String(row.name),
    team: String(row.team),
    position: row.position as NflPlayer["position"],
    active: Boolean(row.active ?? true),
    jersey_number: numOrNull(row.jersey_number),
    headshot_url: row.headshot_url != null ? String(row.headshot_url) : null,
  };
}

function mapPwd(row: DbPwd): PlayerWeekData {
  const injury = injuryFromDb(
    row.injury_status != null ? String(row.injury_status) : undefined,
  );
  const availabilityRaw = row.availability != null ? String(row.availability) : null;
  const availability = (
    availabilityRaw === "available" ||
    availabilityRaw === "taken" ||
    availabilityRaw === "locked" ||
    availabilityRaw === "injured" ||
    availabilityRaw === "questionable"
      ? availabilityRaw
      : availabilityFromInjury(injury)
  ) as PlayerAvailability;

  const tierRaw = row.tier != null ? String(row.tier) : "average";
  const tier = (
    tierRaw === "elite" ||
    tierRaw === "strong" ||
    tierRaw === "solid" ||
    tierRaw === "average" ||
    tierRaw === "long_shot"
      ? tierRaw
      : "average"
  ) as TdTier;

  return {
    id: String(row.id),
    player_id: String(row.player_id),
    week_id: String(row.week_id),
    game_id: String(row.game_id),
    market_probability: num(row.market_probability),
    our_probability: num(row.our_probability),
    td_pool_score: num(row.td_pool_score),
    td_pool_rank: num(row.td_pool_rank),
    matchup_rating: num(row.matchup_rating),
    goal_line_rating: num(row.goal_line_rating),
    research_json: (row.research_json as ResearchJson) ?? ({} as ResearchJson),
    injury_status: injury,
    availability,
    tier,
    consensus_american_odds: num(row.consensus_american_odds),
    consensus_decimal_odds: num(row.consensus_decimal_odds),
    updated_at: String(row.updated_at ?? nowIso()),
  };
}

function mapPick(row: DbPick): Pick {
  return {
    id: String(row.id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    week_id: String(row.week_id),
    player_id: String(row.player_id),
    odds_at_selection: num(row.odds_at_selection),
    probability_at_selection: num(row.probability_at_selection),
    picked_at: String(row.picked_at),
    result: (row.result as Pick["result"]) ?? "pending",
    touchdown_scored:
      row.touchdown_scored == null ? null : Boolean(row.touchdown_scored),
    overridden: Boolean(row.overridden ?? false),
  };
}

function leagueToDbPatch(settings: UpdateLeagueSettingsInput): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (settings.name !== undefined) patch.name = settings.name;
  if (settings.currency !== undefined) patch.currency = settings.currency;
  if (settings.betting_mode !== undefined) patch.betting_mode = settings.betting_mode;
  if (settings.contribution_per_member !== undefined) {
    patch.contribution_per_member = settings.contribution_per_member;
  }
  if (settings.fixed_weekly_stake !== undefined) {
    patch.fixed_weekly_stake = settings.fixed_weekly_stake;
  }
  if (settings.pick_lock_type !== undefined) patch.pick_lock_type = settings.pick_lock_type;
  if (settings.pick_deadline_at !== undefined) {
    patch.custom_lock_at = settings.pick_deadline_at;
  }
  if (settings.allow_pick_changes !== undefined) {
    patch.allow_pick_changes = settings.allow_pick_changes;
  }
  if (settings.odds_format !== undefined) patch.odds_format = settings.odds_format;
  if (settings.survivor_mode !== undefined) patch.survivor_mode = settings.survivor_mode;
  if (settings.admin_pin !== undefined) patch.admin_pin = settings.admin_pin;
  if (settings.join_pin !== undefined) patch.join_pin = settings.join_pin;
  if (settings.logo_url !== undefined) patch.logo_url = settings.logo_url;
  if (settings.member_count !== undefined) {
    patch.member_count_setting = settings.member_count;
  }
  if (settings.active_week_id !== undefined) {
    patch.active_week_id = settings.active_week_id;
  }
  return patch;
}

export class SupabaseStore implements Store {
  constructor(private readonly client: SupabaseClient = createAdminClient()) {}

  async getLeagueBySlug(slug: string): Promise<League | null> {
    const { data, error } = await this.client
      .from("leagues")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return data ? mapLeague(data) : null;
  }

  async createLeague(input: CreateLeagueInput): Promise<League> {
    const slug = slugify(input.slug ?? input.name);
    if (!slug) {
      throw new StoreError("League name produces an empty slug", "VALIDATION");
    }

    const { data: existing } = await this.client
      .from("leagues")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      throw new StoreError(`Slug "${slug}" is already taken`, "CONFLICT");
    }

    const memberNames =
      input.member_names && input.member_names.length > 0
        ? [...input.member_names]
        : [input.admin_display_name];
    if (!memberNames.includes(input.admin_display_name)) {
      memberNames.unshift(input.admin_display_name);
    }
    const memberCount = input.member_count ?? memberNames.length;

    const pool = resolvePoolWeek(new Date());
    const window = weekWindow(pool.season, pool.week);
    let week = await this.getWeekBySeasonWeek(pool.season, pool.week);
    if (!week) {
      const weekId = randomUUID();
      const { data: insertedWeek, error: weekErr } = await this.client
        .from("nfl_weeks")
        .insert({
          id: weekId,
          season: pool.season,
          week: pool.week,
          start_date: window.start_date,
          end_date: window.end_date,
          label: window.label,
        })
        .select("*")
        .single();
      if (weekErr) throw weekErr;
      week = mapWeek(insertedWeek);
    } else {
      await this.ensureWeek({
        season: pool.season,
        week: pool.week,
        start_date: window.start_date,
        end_date: window.end_date,
        label: window.label,
      });
    }

    const createdAt = nowIso();
    const leagueId = randomUUID();
    const { data: leagueRow, error: leagueErr } = await this.client
      .from("leagues")
      .insert({
        id: leagueId,
        name: input.name.trim(),
        slug,
        admin_user_id: null,
        currency: input.currency ?? "USD",
        betting_mode: input.betting_mode ?? "individual",
        contribution_per_member: input.contribution_per_member ?? 10,
        fixed_weekly_stake: input.fixed_weekly_stake ?? null,
        member_count_setting: memberCount,
        pick_lock_type: input.pick_lock_type ?? "individual_game",
        custom_lock_at: input.pick_deadline_at ?? null,
        allow_pick_changes: input.allow_pick_changes ?? true,
        odds_format: input.odds_format ?? "american",
        survivor_mode: input.survivor_mode ?? false,
        admin_pin: input.admin_pin,
        join_pin: input.join_pin,
        logo_url: input.logo_url ?? null,
        active_week_id: week.id,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select("*")
      .single();

    if (leagueErr) {
      if (isUniqueViolation(leagueErr)) {
        throw new StoreError(`Slug "${slug}" is already taken`, "CONFLICT");
      }
      throw leagueErr;
    }

    const members = memberNames.map((name) => ({
      id: randomUUID(),
      league_id: leagueId,
      user_id: null,
      display_name: name,
      role: name === input.admin_display_name ? "admin" : "member",
      active: true,
      pin: name === input.admin_display_name ? input.admin_pin : null,
      created_at: createdAt,
    }));

    const { error: membersErr } = await this.client
      .from("league_members")
      .insert(members);
    if (membersErr) throw membersErr;

    return mapLeague(leagueRow);
  }

  async joinLeague(input: JoinLeagueInput): Promise<JoinLeagueResult> {
    const slug = input.slug.trim().toLowerCase();
    const displayName = input.display_name.trim();
    const joinPin = input.join_pin.trim();

    if (!displayName) {
      throw new StoreError("Display name is required", "VALIDATION");
    }
    if (!joinPin) {
      throw new StoreError("Join PIN is required", "VALIDATION");
    }

    const league = await this.getLeagueBySlug(slug);
    if (!league) throw new StoreError("League not found", "NOT_FOUND");
    if (league.join_pin !== joinPin) {
      throw new StoreError("Invalid join PIN", "FORBIDDEN");
    }

    const { data: existingRows, error: existingErr } = await this.client
      .from("league_members")
      .select("*")
      .eq("league_id", league.id)
      .ilike("display_name", displayName);
    if (existingErr) throw existingErr;

    const existing = (existingRows ?? []).find(
      (row) =>
        String(row.display_name).toLowerCase() === displayName.toLowerCase(),
    );

    if (existing) {
      if (existing.active) {
        throw new StoreError(
          "That display name is already taken in this league",
          "CONFLICT",
        );
      }
      const { data: reactivated, error: reactivateErr } = await this.client
        .from("league_members")
        .update({ active: true })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (reactivateErr) throw reactivateErr;
      await this.client
        .from("leagues")
        .update({
          member_count_setting: (await this.listMembers(league.id)).length,
          updated_at: nowIso(),
        })
        .eq("id", league.id);
      return { league, member: mapMember(reactivated) };
    }

    const createdAt = nowIso();
    const { data: inserted, error: insertErr } = await this.client
      .from("league_members")
      .insert({
        id: randomUUID(),
        league_id: league.id,
        user_id: null,
        display_name: displayName,
        role: "member",
        active: true,
        pin: null,
        created_at: createdAt,
      })
      .select("*")
      .single();

    if (insertErr) {
      if (isUniqueViolation(insertErr)) {
        throw new StoreError(
          "That display name is already taken in this league",
          "CONFLICT",
        );
      }
      throw insertErr;
    }

    const members = await this.listMembers(league.id);
    await this.client
      .from("leagues")
      .update({
        member_count_setting: members.length,
        updated_at: nowIso(),
      })
      .eq("id", league.id);

    return { league, member: mapMember(inserted) };
  }

  async setMemberActive(
    leagueId: string,
    memberId: string,
    active: boolean,
  ): Promise<LeagueMember> {
    const { data: memberRow, error: memberErr } = await this.client
      .from("league_members")
      .select("*")
      .eq("id", memberId)
      .eq("league_id", leagueId)
      .maybeSingle();
    if (memberErr) throw memberErr;
    if (!memberRow) throw new StoreError("Member not found", "NOT_FOUND");

    if (!active && memberRow.role === "admin") {
      const { data: otherAdmins, error: adminsErr } = await this.client
        .from("league_members")
        .select("id")
        .eq("league_id", leagueId)
        .eq("active", true)
        .eq("role", "admin")
        .neq("id", memberId);
      if (adminsErr) throw adminsErr;
      if (!otherAdmins?.length) {
        throw new StoreError(
          "Cannot remove the last admin from the league",
          "FORBIDDEN",
        );
      }
    }

    const { data: updated, error: updateErr } = await this.client
      .from("league_members")
      .update({ active })
      .eq("id", memberId)
      .select("*")
      .single();
    if (updateErr) throw updateErr;

    const members = await this.listMembers(leagueId);
    await this.client
      .from("leagues")
      .update({
        member_count_setting: members.length,
        updated_at: nowIso(),
      })
      .eq("id", leagueId);

    return mapMember(updated);
  }

  async listMembers(leagueId: string): Promise<LeagueMember[]> {
    const { data, error } = await this.client
      .from("league_members")
      .select("*")
      .eq("league_id", leagueId)
      .eq("active", true);
    if (error) throw error;
    return (data ?? []).map(mapMember);
  }

  async getPicksForWeek(leagueId: string, weekId: string): Promise<Pick[]> {
    const { data, error } = await this.client
      .from("picks")
      .select("*")
      .eq("league_id", leagueId)
      .eq("week_id", weekId);
    if (error) throw error;
    return (data ?? []).map(mapPick);
  }

  async getPlayerWeekData(weekId: string): Promise<PlayerWeekData[]> {
    const { data, error } = await this.client
      .from("player_week_data")
      .select("*")
      .eq("week_id", weekId)
      .order("td_pool_rank", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapPwd);
  }

  async submitPick(input: SelectPickInput): Promise<Pick> {
    return this.applyPick(input, "submit");
  }

  async changePick(input: SelectPickInput): Promise<Pick> {
    return this.applyPick(input, "change");
  }

  async overridePick(input: SelectPickInput): Promise<Pick> {
    return this.applyPick(input, "override");
  }

  private async applyPick(
    input: SelectPickInput,
    mode: "submit" | "change" | "override",
  ): Promise<Pick> {
    const { data: leagueRow, error: leagueErr } = await this.client
      .from("leagues")
      .select("*")
      .eq("id", input.league_id)
      .maybeSingle();
    if (leagueErr) throw leagueErr;
    if (!leagueRow) throw new StoreError("League not found", "NOT_FOUND");
    const league = mapLeague(leagueRow);

    const { data: memberRow, error: memberErr } = await this.client
      .from("league_members")
      .select("*")
      .eq("id", input.member_id)
      .eq("league_id", input.league_id)
      .maybeSingle();
    if (memberErr) throw memberErr;
    if (!memberRow || !memberRow.active) {
      throw new StoreError("Member not found", "NOT_FOUND");
    }

    const { data: pwdRow, error: pwdErr } = await this.client
      .from("player_week_data")
      .select("*")
      .eq("player_id", input.player_id)
      .eq("week_id", input.week_id)
      .maybeSingle();
    if (pwdErr) throw pwdErr;
    if (!pwdRow) {
      throw new StoreError("Player not available for this week", "NOT_FOUND");
    }
    const pwd = mapPwd(pwdRow);

    if (mode !== "override" && league.pick_lock_type === "individual_game") {
      const { data: gameRow } = await this.client
        .from("nfl_games")
        .select("status")
        .eq("id", pwd.game_id)
        .maybeSingle();
      if (
        gameRow &&
        (gameRow.status === "in_progress" || gameRow.status === "final")
      ) {
        throw new StoreError(
          "This player's game has already started",
          "LOCKED",
        );
      }
    }

    const { data: existingMemberPickRow } = await this.client
      .from("picks")
      .select("*")
      .eq("league_id", input.league_id)
      .eq("week_id", input.week_id)
      .eq("member_id", input.member_id)
      .maybeSingle();
    const existingMemberPick = existingMemberPickRow
      ? mapPick(existingMemberPickRow)
      : null;

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

    const { data: conflicting } = await this.client
      .from("picks")
      .select("id, member_id")
      .eq("league_id", input.league_id)
      .eq("week_id", input.week_id)
      .eq("player_id", input.player_id)
      .neq("member_id", input.member_id)
      .maybeSingle();
    if (conflicting) {
      throw new StoreError(
        "Player already selected by another member this week",
        "CONFLICT",
      );
    }

    if (existingMemberPick && existingMemberPick.player_id === input.player_id) {
      if (mode !== "override") {
        return existingMemberPick;
      }
      const { data: updated, error: updErr } = await this.client
        .from("picks")
        .update({
          odds_at_selection: pwd.consensus_american_odds,
          decimal_odds_at_selection: pwd.consensus_decimal_odds,
          probability_at_selection: pwd.market_probability,
          picked_at: nowIso(),
          overridden: true,
        })
        .eq("id", existingMemberPick.id)
        .select("*")
        .single();
      if (updErr) throw updErr;
      await this.client
        .from("player_week_data")
        .update({ availability: "taken" })
        .eq("id", pwd.id);
      return mapPick(updated);
    }

    // Release previous player availability when changing / overriding.
    if (existingMemberPick) {
      const { data: previousPwd } = await this.client
        .from("player_week_data")
        .select("*")
        .eq("player_id", existingMemberPick.player_id)
        .eq("week_id", input.week_id)
        .maybeSingle();
      if (previousPwd && previousPwd.availability === "taken") {
        const prevInjury = injuryFromDb(String(previousPwd.injury_status));
        await this.client
          .from("player_week_data")
          .update({ availability: availabilityFromInjury(prevInjury) })
          .eq("id", previousPwd.id);
      }
      const { error: delErr } = await this.client
        .from("picks")
        .delete()
        .eq("id", existingMemberPick.id);
      if (delErr) throw delErr;
    }

    const pickId = randomUUID();
    const pickedAt = nowIso();
    const insertRow = {
      id: pickId,
      league_id: input.league_id,
      member_id: input.member_id,
      week_id: input.week_id,
      player_id: input.player_id,
      odds_at_selection: pwd.consensus_american_odds,
      decimal_odds_at_selection: pwd.consensus_decimal_odds,
      probability_at_selection: pwd.market_probability,
      picked_at: pickedAt,
      result: "pending" as const,
      touchdown_scored: null,
      overridden: mode === "override",
    };

    const { data: inserted, error: insertErr } = await this.client
      .from("picks")
      .insert(insertRow)
      .select("*")
      .single();

    if (insertErr) {
      if (isUniqueViolation(insertErr)) {
        throw new StoreError(
          "Player already selected by another member this week",
          "CONFLICT",
        );
      }
      throw insertErr;
    }

    await this.client
      .from("player_week_data")
      .update({ availability: "taken" })
      .eq("id", pwd.id);

    return mapPick(inserted);
  }

  async updateLeagueSettings(
    leagueId: string,
    settings: UpdateLeagueSettingsInput,
  ): Promise<League> {
    const { data, error } = await this.client
      .from("leagues")
      .update(leagueToDbPatch(settings))
      .eq("id", leagueId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new StoreError("League not found", "NOT_FOUND");
    return mapLeague(data);
  }

  async getWeekBySeasonWeek(
    season: number,
    week: number,
  ): Promise<NflWeek | null> {
    const { data, error } = await this.client
      .from("nfl_weeks")
      .select("*")
      .eq("season", season)
      .eq("week", week)
      .maybeSingle();
    if (error) throw error;
    return data ? mapWeek(data) : null;
  }

  async listWeeks(): Promise<NflWeek[]> {
    const { data, error } = await this.client
      .from("nfl_weeks")
      .select("*")
      .order("season", { ascending: true })
      .order("week", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapWeek);
  }

  async listGamesForWeek(weekId: string): Promise<NflGame[]> {
    const { data, error } = await this.client
      .from("nfl_games")
      .select("*")
      .eq("week_id", weekId);
    if (error) throw error;
    return (data ?? []).map(mapGame);
  }

  async listPlayers(): Promise<NflPlayer[]> {
    const { data, error } = await this.client.from("nfl_players").select("*");
    if (error) throw error;
    return (data ?? []).map(mapPlayer);
  }

  async listLeagues(): Promise<League[]> {
    const { data, error } = await this.client.from("leagues").select("*");
    if (error) throw error;
    return (data ?? []).map(mapLeague);
  }

  async updateGameStatuses(updates: GameStatusUpdate[]): Promise<number> {
    if (updates.length === 0) return 0;
    let changed = 0;
    for (const update of updates) {
      const { data, error } = await this.client
        .from("nfl_games")
        .update({
          status: update.status,
          home_score: update.home_score,
          away_score: update.away_score,
        })
        .eq("id", update.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (data) changed += 1;
    }
    return changed;
  }

  async resolvePickResults(updates: PickResultUpdate[]): Promise<number> {
    if (updates.length === 0) return 0;
    let changed = 0;
    for (const update of updates) {
      const { data, error } = await this.client
        .from("picks")
        .update({
          result: update.result,
          touchdown_scored: update.touchdown_scored,
        })
        .eq("id", update.pickId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (data) changed += 1;
    }
    return changed;
  }

  async applyOddsRefresh(input: ApplyOddsRefreshInput): Promise<number> {
    const { data: players, error: playersErr } = await this.client
      .from("nfl_players")
      .select("*")
      .not("external_player_id", "is", null);
    if (playersErr) throw playersErr;

    const { data: games, error: gamesErr } = await this.client
      .from("nfl_games")
      .select("*")
      .eq("week_id", input.weekId);
    if (gamesErr) throw gamesErr;

    const playersByExternal = new Map(
      (players ?? [])
        .filter((p) => p.external_player_id)
        .map((p) => [String(p.external_player_id), mapPlayer(p)] as const),
    );
    const gamesByExternal = new Map(
      (games ?? [])
        .filter((g) => g.external_game_id)
        .map((g) => [String(g.external_game_id), mapGame(g)] as const),
    );

    const fetchedAt =
      input.quotes[0]?.fetched_at ??
      input.consensus[0]?.fetched_at ??
      nowIso();

    await this.client.from("player_odds").delete().eq("week_id", input.weekId);

    const mappedGames = (games ?? []).map(mapGame);
    const gamesById = new Map(mappedGames.map((g) => [g.id, g]));

    const oddsRows: Record<string, unknown>[] = [];
    for (const quote of input.quotes) {
      const player = playersByExternal.get(quote.external_player_id);
      if (!player) continue;
      let game = gamesByExternal.get(quote.external_game_id);
      if (!game) {
        const { data: pwdLink } = await this.client
          .from("player_week_data")
          .select("game_id")
          .eq("week_id", input.weekId)
          .eq("player_id", player.id)
          .maybeSingle();
        if (pwdLink?.game_id) {
          game = gamesById.get(String(pwdLink.game_id));
        }
      }
      if (!game) continue;

      oddsRows.push({
        id: randomUUID(),
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

    if (oddsRows.length > 0) {
      const { error: oddsErr } = await this.client
        .from("player_odds")
        .insert(oddsRows);
      if (oddsErr) throw oddsErr;
    }

    let playersUpdated = 0;
    for (const row of input.consensus) {
      const player = playersByExternal.get(row.external_player_id);
      if (!player) continue;

      const { data: pwdRow } = await this.client
        .from("player_week_data")
        .select("*")
        .eq("week_id", input.weekId)
        .eq("player_id", player.id)
        .maybeSingle();
      if (!pwdRow) continue;

      const research = {
        ...((pwdRow.research_json as ResearchJson) ?? {}),
        market: {
          consensus_american: row.american_odds,
          consensus_implied: row.implied_probability,
          books: row.books.map((b) => ({
            sportsbook: b.sportsbook,
            american_odds: b.american_odds,
          })),
        },
      };

      const { error: updErr } = await this.client
        .from("player_week_data")
        .update({
          consensus_american_odds: row.american_odds,
          consensus_decimal_odds: row.decimal_odds,
          market_probability: row.implied_probability,
          research_json: research,
          updated_at: fetchedAt,
        })
        .eq("id", pwdRow.id);
      if (updErr) throw updErr;
      playersUpdated += 1;
    }

    // Persist fresh ranks after market quotes land.
    const { data: weekRows, error: weekRowsErr } = await this.client
      .from("player_week_data")
      .select(
        "id, market_probability, td_pool_score, our_probability, consensus_american_odds",
      )
      .eq("week_id", input.weekId);
    if (weekRowsErr) throw weekRowsErr;

    const ordered = [...(weekRows ?? [])].sort(
      (a, b) =>
        playerWeekRankKey({
          market_probability: num(b.market_probability),
          td_pool_score: num(b.td_pool_score),
          our_probability: num(b.our_probability),
          consensus_american_odds: num(b.consensus_american_odds),
        }) -
        playerWeekRankKey({
          market_probability: num(a.market_probability),
          td_pool_score: num(a.td_pool_score),
          our_probability: num(a.our_probability),
          consensus_american_odds: num(a.consensus_american_odds),
        }),
    );

    for (let i = 0; i < ordered.length; i += 1) {
      const row = ordered[i]!;
      const { error: rankErr } = await this.client
        .from("player_week_data")
        .update({ td_pool_rank: i + 1, updated_at: fetchedAt })
        .eq("id", row.id);
      if (rankErr) throw rankErr;
    }

    return playersUpdated;
  }

  async ensureWeek(input: {
    season: number;
    week: number;
    start_date: string;
    end_date: string;
    label?: string;
  }): Promise<NflWeek> {
    const existing = await this.getWeekBySeasonWeek(input.season, input.week);
    if (existing) {
      const { data, error } = await this.client
        .from("nfl_weeks")
        .update({
          start_date: input.start_date,
          end_date: input.end_date,
          label: input.label ?? existing.label ?? `NFL Week ${input.week}`,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      return mapWeek(data);
    }

    const { data, error } = await this.client
      .from("nfl_weeks")
      .insert({
        id: randomUUID(),
        season: input.season,
        week: input.week,
        start_date: input.start_date,
        end_date: input.end_date,
        label: input.label ?? `NFL Week ${input.week}`,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapWeek(data);
  }

  async upsertGamesForWeek(
    weekId: string,
    games: import("@/lib/providers/types").ProviderGame[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const g of games) {
      const { data: byExternal } = await this.client
        .from("nfl_games")
        .select("id")
        .eq("week_id", weekId)
        .eq("external_game_id", g.external_game_id)
        .maybeSingle();

      const { data: byMatchup } = byExternal
        ? { data: null }
        : await this.client
            .from("nfl_games")
            .select("id")
            .eq("week_id", weekId)
            .eq("home_team", g.home_team)
            .eq("away_team", g.away_team)
            .maybeSingle();

      const existingId = byExternal?.id
        ? String(byExternal.id)
        : byMatchup?.id
          ? String(byMatchup.id)
          : null;

      const fields = {
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
      };

      if (existingId) {
        const { error } = await this.client
          .from("nfl_games")
          .update(fields)
          .eq("id", existingId);
        if (error) throw error;
        map.set(g.external_game_id, existingId);
      } else {
        const id = randomUUID();
        const { error } = await this.client
          .from("nfl_games")
          .insert({ id, ...fields });
        if (error) throw error;
        map.set(g.external_game_id, id);
      }
    }
    return map;
  }

  async upsertPlayers(
    players: import("@/lib/providers/types").ProviderPlayer[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const concurrency = 8;
    let cursor = 0;

    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < players.length) {
        const i = cursor;
        cursor += 1;
        const p = players[i]!;

        const { data: byExternal } = await this.client
          .from("nfl_players")
          .select("id")
          .eq("external_player_id", p.external_player_id)
          .maybeSingle();

        let existingId = byExternal?.id ? String(byExternal.id) : null;
        if (!existingId) {
          const { data: byName } = await this.client
            .from("nfl_players")
            .select("id")
            .ilike("name", p.name)
            .eq("team", p.team)
            .maybeSingle();
          existingId = byName?.id ? String(byName.id) : null;
        }

        const fields = {
          external_player_id: p.external_player_id,
          name: p.name,
          team: p.team,
          position: p.position,
          active: p.active,
          jersey_number: p.jersey_number,
          headshot_url: p.headshot_url,
        };

        if (existingId) {
          const { error } = await this.client
            .from("nfl_players")
            .update(fields)
            .eq("id", existingId);
          if (error) throw error;
          map.set(p.external_player_id, existingId);
        } else {
          const id = randomUUID();
          const { error } = await this.client
            .from("nfl_players")
            .insert({ id, ...fields });
          if (error) throw error;
          map.set(p.external_player_id, id);
        }
      }
    });

    await Promise.all(workers);
    return map;
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
    const { error: delErr } = await this.client
      .from("player_week_data")
      .delete()
      .eq("week_id", weekId);
    if (delErr) throw delErr;

    if (rows.length === 0) return 0;

    const now = nowIso();
    const payload = rows.map((row) => ({
      id: randomUUID(),
      player_id: row.player_id,
      week_id: weekId,
      game_id: row.game_id,
      market_probability: row.market_probability,
      our_probability: row.our_probability,
      td_pool_score: row.td_pool_score,
      td_pool_rank: row.td_pool_rank,
      matchup_rating: row.matchup_rating,
      goal_line_rating: row.goal_line_rating,
      research_json: row.research_json,
      injury_status: injuryToDb(row.injury_status),
      availability: row.availability,
      tier: row.tier,
      consensus_american_odds: row.consensus_american_odds,
      consensus_decimal_odds: row.consensus_decimal_odds,
      updated_at: now,
    }));

    const { error } = await this.client.from("player_week_data").insert(payload);
    if (error) throw error;
    return payload.length;
  }

  /** Optional: wipe + reseed via seed helper (dev). */
  async reseed(): Promise<{ slug: string; leagueName: string }> {
    const { seedSupabaseFromLocalPayload } = await import(
      "@/lib/store/seed-supabase"
    );
    return seedSupabaseFromLocalPayload();
  }

  async getDashboard(slug: string): Promise<LeagueDashboard | null> {
    const league = await this.getLeagueBySlug(slug);
    if (!league || !league.active_week_id) return null;

    const { data: weekRow, error: weekErr } = await this.client
      .from("nfl_weeks")
      .select("*")
      .eq("id", league.active_week_id)
      .maybeSingle();
    if (weekErr) throw weekErr;
    if (!weekRow) return null;
    const week = mapWeek(weekRow);

    const members = (await this.listMembers(league.id)).sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );

    const picks = await this.getPicksForWeek(league.id, week.id);
    const pickByMember = new Map(picks.map((p) => [p.member_id, p]));
    const takenByPlayer = new Map(
      picks.map((p) => {
        const member = members.find((m) => m.id === p.member_id);
        return [p.player_id, member?.display_name ?? "Unknown"] as const;
      }),
    );

    const { data: playerRows, error: playersErr } = await this.client
      .from("nfl_players")
      .select("*");
    if (playersErr) throw playersErr;
    const playersById = new Map(
      (playerRows ?? []).map((p) => [String(p.id), mapPlayer(p)]),
    );

    const games = await this.listGamesForWeek(week.id);
    const gamesById = new Map(games.map((g) => [g.id, g]));

    const pwdList = await this.getPlayerWeekData(week.id);
    const pwdByPlayer = new Map(pwdList.map((p) => [p.player_id, p]));

    const memberStatuses: MemberPickStatus[] = members.map((member) => {
      const pick = pickByMember.get(member.id) ?? null;
      const player = pick ? (playersById.get(pick.player_id) ?? null) : null;
      const player_week = pick ? (pwdByPlayer.get(pick.player_id) ?? null) : null;
      return { member, pick, player, player_week };
    });

    const stake = calculateWeeklyStake(league);
    const decimalLegs = picks.map((p) => {
      const pwd = pwdByPlayer.get(p.player_id);
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

    const ranked_players = pwdList
      .map((pwd) => {
        const player = playersById.get(pwd.player_id);
        const game = gamesById.get(pwd.game_id);
        if (!player || !game) return null;
        const gameStarted =
          game.status === "in_progress" || game.status === "final";
        let availability = takenByPlayer.has(pwd.player_id)
          ? ("taken" as const)
          : pwd.availability;
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
      )
      .sort((a, b) => playerWeekRankKey(b) - playerWeekRankKey(a))
      .map((row, index) => ({
        ...row,
        td_pool_rank: index + 1,
      }));

    const firstKickoff =
      games.map((g) => g.kickoff_at).sort()[0] ?? null;

    const pick_lock_at =
      league.pick_lock_type === "custom"
        ? league.pick_deadline_at
        : firstKickoff;

    const picks_locked = pick_lock_at
      ? Date.now() >= new Date(pick_lock_at).getTime() &&
        league.pick_lock_type !== "individual_game"
      : false;

    const { data: oddsRows } = await this.client
      .from("player_odds")
      .select("fetched_at")
      .eq("week_id", week.id)
      .order("fetched_at", { ascending: false })
      .limit(1);
    const odds_updated_at =
      oddsRows && oddsRows.length > 0
        ? String(oddsRows[0].fetched_at)
        : null;

    return {
      league,
      week,
      members: memberStatuses,
      parlay,
      ranked_players,
      pick_lock_at,
      picks_locked,
      odds_updated_at,
    };
  }
}

let singleton: SupabaseStore | null = null;

export function getSupabaseStore(): SupabaseStore {
  if (!singleton) {
    singleton = new SupabaseStore();
  }
  return singleton;
}
