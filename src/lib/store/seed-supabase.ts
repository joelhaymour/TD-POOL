import { randomUUID } from "crypto";
import { buildSeedPayload } from "@/data/mock/seed-league";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  InjuryStatus,
  League,
  LeagueMember,
  NflGame,
  NflPlayer,
  NflWeek,
  Pick,
  PlayerOdds,
  PlayerWeekData,
} from "@/lib/types";

const DEMO_SLUG = "joels-league";

function injuryToDb(status: InjuryStatus): string {
  return status === "injured_reserve" ? "ir" : status;
}

/**
 * Idempotent seed of the demo league into Supabase from the local mock payload.
 * Deletes existing league by slug (cascade members/picks), upserts NFL reference data.
 */
export async function seedSupabaseFromLocalPayload(): Promise<{
  slug: string;
  leagueName: string;
}> {
  const client = createAdminClient();
  const payload = await buildSeedPayload();

  // --- Weeks (natural key: season + week) ---
  const weekIdMap = new Map<string, string>();
  for (const week of payload.weeks) {
    const id = await upsertWeek(client, week);
    weekIdMap.set(week.id, id);
  }

  // --- Players (natural key: external_player_id) ---
  const playerIdMap = new Map<string, string>();
  for (const player of payload.players) {
    const id = await upsertPlayer(client, player);
    playerIdMap.set(player.id, id);
  }

  // --- Games (natural key: week_id + home + away) ---
  const gameIdMap = new Map<string, string>();
  for (const game of payload.games) {
    const weekId = weekIdMap.get(game.week_id);
    if (!weekId) continue;
    const id = await upsertGame(client, game, weekId);
    gameIdMap.set(game.id, id);
  }

  // --- Player week data ---
  for (const pwd of payload.player_week_data) {
    const weekId = weekIdMap.get(pwd.week_id);
    const playerId = playerIdMap.get(pwd.player_id);
    const gameId = gameIdMap.get(pwd.game_id);
    if (!weekId || !playerId || !gameId) continue;
    await upsertPlayerWeekData(client, pwd, weekId, playerId, gameId);
  }

  // --- Player odds (replace for mapped weeks) ---
  const weekIds = [...new Set(weekIdMap.values())];
  for (const weekId of weekIds) {
    await client.from("player_odds").delete().eq("week_id", weekId);
  }
  const oddsRows = payload.player_odds
    .map((o) => toOddsRow(o, weekIdMap, playerIdMap, gameIdMap))
    .filter((r): r is Record<string, unknown> => r !== null);
  if (oddsRows.length > 0) {
    // Insert in chunks to avoid payload limits
    for (let i = 0; i < oddsRows.length; i += 200) {
      const chunk = oddsRows.slice(i, i + 200);
      const { error } = await client.from("player_odds").insert(chunk);
      if (error) throw error;
    }
  }

  // --- League: delete existing demo by slug (cascade members/picks) ---
  await client.from("leagues").delete().eq("slug", DEMO_SLUG);

  const srcLeague = payload.leagues[0];
  if (!srcLeague) {
    throw new Error("Seed payload has no leagues");
  }

  const leagueId = randomUUID();
  const activeWeekId = srcLeague.active_week_id
    ? (weekIdMap.get(srcLeague.active_week_id) ?? null)
    : null;

  const { error: leagueErr } = await client.from("leagues").insert(
    toLeagueRow(srcLeague, leagueId, activeWeekId),
  );
  if (leagueErr) throw leagueErr;

  const memberIdMap = new Map<string, string>();
  const memberRows = payload.members
    .filter((m) => m.league_id === srcLeague.id)
    .map((m) => {
      const id = randomUUID();
      memberIdMap.set(m.id, id);
      return toMemberRow(m, id, leagueId);
    });

  if (memberRows.length > 0) {
    const { error: membersErr } = await client
      .from("league_members")
      .insert(memberRows);
    if (membersErr) throw membersErr;
  }

  const pickRows = payload.picks
    .filter((p) => p.league_id === srcLeague.id)
    .map((p) => toPickRow(p, leagueId, memberIdMap, weekIdMap, playerIdMap))
    .filter((r): r is Record<string, unknown> => r !== null);

  if (pickRows.length > 0) {
    const { error: picksErr } = await client.from("picks").insert(pickRows);
    if (picksErr) throw picksErr;
  }

  // Mark taken availability for seeded picks
  for (const pick of pickRows) {
    await client
      .from("player_week_data")
      .update({ availability: "taken" })
      .eq("week_id", pick.week_id)
      .eq("player_id", pick.player_id);
  }

  return {
    slug: DEMO_SLUG,
    leagueName: srcLeague.name,
  };
}

async function upsertWeek(
  client: ReturnType<typeof createAdminClient>,
  week: NflWeek,
): Promise<string> {
  const { data: existing } = await client
    .from("nfl_weeks")
    .select("id")
    .eq("season", week.season)
    .eq("week", week.week)
    .maybeSingle();

  if (existing?.id) {
    await client
      .from("nfl_weeks")
      .update({
        start_date: week.start_date,
        end_date: week.end_date,
        label: week.label ?? `NFL Week ${week.week}`,
      })
      .eq("id", existing.id);
    return String(existing.id);
  }

  const id = randomUUID();
  const { error } = await client.from("nfl_weeks").insert({
    id,
    season: week.season,
    week: week.week,
    start_date: week.start_date,
    end_date: week.end_date,
    label: week.label ?? `NFL Week ${week.week}`,
  });
  if (error) throw error;
  return id;
}

async function upsertPlayer(
  client: ReturnType<typeof createAdminClient>,
  player: NflPlayer,
): Promise<string> {
  if (player.external_player_id) {
    const { data: existing } = await client
      .from("nfl_players")
      .select("id")
      .eq("external_player_id", player.external_player_id)
      .maybeSingle();
    if (existing?.id) {
      await client
        .from("nfl_players")
        .update({
          name: player.name,
          team: player.team,
          position: player.position,
          active: player.active,
          jersey_number: player.jersey_number,
          headshot_url: player.headshot_url,
        })
        .eq("id", existing.id);
      return String(existing.id);
    }
  }

  const id = randomUUID();
  const { error } = await client.from("nfl_players").insert({
    id,
    external_player_id: player.external_player_id,
    name: player.name,
    team: player.team,
    position: player.position,
    active: player.active,
    jersey_number: player.jersey_number,
    headshot_url: player.headshot_url,
  });
  if (error) throw error;
  return id;
}

async function upsertGame(
  client: ReturnType<typeof createAdminClient>,
  game: NflGame,
  weekId: string,
): Promise<string> {
  const { data: existing } = await client
    .from("nfl_games")
    .select("id")
    .eq("week_id", weekId)
    .eq("home_team", game.home_team)
    .eq("away_team", game.away_team)
    .maybeSingle();

  const fields = {
    external_game_id: game.external_game_id,
    kickoff_at: game.kickoff_at,
    status: game.status,
    spread: game.spread,
    total: game.total,
    home_score: game.home_score,
    away_score: game.away_score,
    stadium: game.stadium,
    is_dome: game.is_dome,
  };

  if (existing?.id) {
    await client.from("nfl_games").update(fields).eq("id", existing.id);
    return String(existing.id);
  }

  const id = randomUUID();
  const { error } = await client.from("nfl_games").insert({
    id,
    week_id: weekId,
    home_team: game.home_team,
    away_team: game.away_team,
    ...fields,
  });
  if (error) throw error;
  return id;
}

async function upsertPlayerWeekData(
  client: ReturnType<typeof createAdminClient>,
  pwd: PlayerWeekData,
  weekId: string,
  playerId: string,
  gameId: string,
): Promise<void> {
  const row = {
    player_id: playerId,
    week_id: weekId,
    game_id: gameId,
    market_probability: pwd.market_probability,
    our_probability: pwd.our_probability,
    td_pool_score: pwd.td_pool_score,
    td_pool_rank: pwd.td_pool_rank,
    matchup_rating: pwd.matchup_rating,
    goal_line_rating: pwd.goal_line_rating,
    research_json: pwd.research_json,
    injury_status: injuryToDb(pwd.injury_status),
    availability: pwd.availability,
    tier: pwd.tier,
    consensus_american_odds: pwd.consensus_american_odds,
    consensus_decimal_odds: pwd.consensus_decimal_odds,
    updated_at: pwd.updated_at,
  };

  const { data: existing } = await client
    .from("player_week_data")
    .select("id")
    .eq("player_id", playerId)
    .eq("week_id", weekId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await client
      .from("player_week_data")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("player_week_data").insert({
    id: randomUUID(),
    ...row,
  });
  if (error) throw error;
}

function toOddsRow(
  odds: PlayerOdds,
  weekIdMap: Map<string, string>,
  playerIdMap: Map<string, string>,
  gameIdMap: Map<string, string>,
): Record<string, unknown> | null {
  const weekId = weekIdMap.get(odds.week_id);
  const playerId = playerIdMap.get(odds.player_id);
  const gameId = gameIdMap.get(odds.game_id);
  if (!weekId || !playerId || !gameId) return null;
  return {
    id: randomUUID(),
    player_id: playerId,
    game_id: gameId,
    week_id: weekId,
    sportsbook: odds.sportsbook,
    market: odds.market,
    american_odds: odds.american_odds,
    decimal_odds: odds.decimal_odds,
    implied_probability: odds.implied_probability,
    fetched_at: odds.fetched_at,
  };
}

function toLeagueRow(
  league: League,
  id: string,
  activeWeekId: string | null,
): Record<string, unknown> {
  return {
    id,
    name: league.name,
    slug: DEMO_SLUG,
    admin_user_id: null,
    currency: league.currency,
    betting_mode: league.betting_mode,
    contribution_per_member: league.contribution_per_member ?? 10,
    fixed_weekly_stake: league.fixed_weekly_stake,
    member_count_setting: league.member_count,
    pick_lock_type: league.pick_lock_type,
    custom_lock_at: league.pick_deadline_at,
    allow_pick_changes: league.allow_pick_changes,
    survivor_mode: league.survivor_mode,
    odds_format: league.odds_format,
    join_pin: league.join_pin,
    logo_url: league.logo_url,
    active_week_id: activeWeekId,
    created_at: league.created_at,
    updated_at: league.updated_at,
  };
}

function toMemberRow(
  member: LeagueMember,
  id: string,
  leagueId: string,
): Record<string, unknown> {
  return {
    id,
    league_id: leagueId,
    user_id: null,
    display_name: member.display_name,
    role: member.role,
    active: member.active,
    created_at: member.created_at,
  };
}

function toPickRow(
  pick: Pick,
  leagueId: string,
  memberIdMap: Map<string, string>,
  weekIdMap: Map<string, string>,
  playerIdMap: Map<string, string>,
): Record<string, unknown> | null {
  const memberId = memberIdMap.get(pick.member_id);
  const weekId = weekIdMap.get(pick.week_id);
  const playerId = playerIdMap.get(pick.player_id);
  if (!memberId || !weekId || !playerId) return null;
  return {
    id: randomUUID(),
    league_id: leagueId,
    member_id: memberId,
    week_id: weekId,
    player_id: playerId,
    odds_at_selection: pick.odds_at_selection,
    probability_at_selection: pick.probability_at_selection,
    picked_at: pick.picked_at,
    result: pick.result,
    touchdown_scored: pick.touchdown_scored,
    overridden: pick.overridden,
  };
}
