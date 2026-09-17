import { randomUUID } from "crypto";
import { generateAllPlayerResearch } from "@/lib/providers/mock/mock-research";
import { createMockOddsProvider } from "@/lib/providers/mock/mock-odds-provider";
import {
  MOCK_WEEK4_GAMES,
  MOCK_WEEK4_PLAYERS,
  TEAM_TO_GAME,
} from "@/lib/providers/mock/mock-nfl-provider";
import {
  americanToDecimal,
  impliedProbabilityFromAmerican,
} from "@/lib/utils/odds";
import type {
  League,
  LeagueMember,
  NflGame,
  NflPlayer,
  NflWeek,
  Pick,
  PlayerOdds,
  PlayerWeekData,
} from "@/lib/types";

export interface SeedPayload {
  leagues: League[];
  members: LeagueMember[];
  weeks: NflWeek[];
  games: NflGame[];
  players: NflPlayer[];
  player_week_data: PlayerWeekData[];
  player_odds: PlayerOdds[];
  picks: Pick[];
}

const MEMBER_NAMES = [
  "Joel",
  "Mike",
  "Chris",
  "Ryan",
  "Adam",
  "Steve",
  "Dan",
  "Kevin",
  "Matt",
  "Brian",
  "Nick",
  "Tom",
] as const;

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Complete demo league payload for local Phase 1–2 development.
 * League: Sunday TD Club / joels-league, Week 4 active, $120 weekly stake.
 * Games stay `scheduled` until admin sync; seed picks (Barkley/Henry/Chase/Gibbs)
 * are guaranteed TDs when finals are simulated via the mock provider.
 */
export async function buildSeedPayload(): Promise<SeedPayload> {
  const createdAt = nowIso();
  const weekId = id("week");
  const leagueId = id("league");

  const week: NflWeek = {
    id: weekId,
    season: 2025,
    week: 4,
    start_date: "2025-09-24",
    end_date: "2025-09-30",
    label: "NFL Week 4",
  };

  const league: League = {
    id: leagueId,
    name: "Sunday TD Club",
    slug: "joels-league",
    admin_user_id: null,
    sections: { td_pool: true, group_bets: false, tickets: true },
    max_props_per_member: 3,
    currency: "USD",
    betting_mode: "fixed",
    contribution_per_member: 10,
    fixed_weekly_stake: 120,
    pick_lock_type: "individual_game",
    pick_deadline_at: null,
    allow_pick_changes: true,
    odds_format: "american",
    survivor_mode: false,
    join_pin: "0000",
    logo_url: null,
    active_week_id: weekId,
    member_count: MEMBER_NAMES.length,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const members: LeagueMember[] = MEMBER_NAMES.map((name, index) => ({
    id: id("member"),
    league_id: leagueId,
    user_id: null,
    display_name: name,
    role: index === 0 ? "admin" : "member",
    active: true,
    created_at: createdAt,
  }));

  const games: NflGame[] = MOCK_WEEK4_GAMES.map((g) => ({
    id: id("game"),
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
  }));

  const gameByExternal = new Map(
    games.map((g) => [g.external_game_id!, g]),
  );

  const players: NflPlayer[] = MOCK_WEEK4_PLAYERS.filter(
    (p) => p.active && TEAM_TO_GAME[p.team],
  ).map((p) => ({
    id: id("player"),
    external_player_id: p.external_player_id,
    name: p.name,
    team: p.team,
    position: p.position,
    active: p.active,
    jersey_number: p.jersey_number,
    headshot_url: p.headshot_url,
  }));

  const playerByExternal = new Map(
    players.map((p) => [p.external_player_id!, p]),
  );

  const oddsProvider = createMockOddsProvider();
  const consensus = await oddsProvider.getConsensusAnytimeTdOdds(2025, 4);
  const allQuotes = await oddsProvider.getAnytimeTdOdds(2025, 4);
  const researchList = generateAllPlayerResearch(consensus);

  const player_week_data: PlayerWeekData[] = researchList
    .map((entry, index) => {
      const player = playerByExternal.get(entry.player.external_player_id);
      const game = gameByExternal.get(entry.game.external_game_id);
      if (!player || !game) return null;

      const availability =
        entry.research.injuries.player_status === "out" ||
        entry.research.injuries.player_status === "injured_reserve"
          ? ("injured" as const)
          : entry.research.injuries.player_status === "questionable" ||
              entry.research.injuries.player_status === "doubtful"
            ? ("questionable" as const)
            : ("available" as const);

      const row: PlayerWeekData = {
        id: id("pwd"),
        player_id: player.id,
        week_id: weekId,
        game_id: game.id,
        market_probability: Number(entry.marketProbability.toFixed(4)),
        our_probability: entry.model.ourProbability,
        td_pool_score: entry.model.score,
        td_pool_rank: index + 1,
        matchup_rating: entry.matchupRating,
        goal_line_rating: entry.goalLineRating,
        research_json: entry.research,
        injury_status: entry.research.injuries.player_status,
        availability,
        tier: entry.model.tier,
        consensus_american_odds: entry.research.market.consensus_american,
        consensus_decimal_odds: Number(
          americanToDecimal(entry.research.market.consensus_american).toFixed(4),
        ),
        updated_at: createdAt,
      };
      return row;
    })
    .filter((row): row is PlayerWeekData => row !== null)
    .sort((a, b) => b.our_probability - a.our_probability)
    .map((row, index) => ({ ...row, td_pool_rank: index + 1 }));

  const player_odds: PlayerOdds[] = [];
  for (const q of allQuotes) {
    const player = playerByExternal.get(q.external_player_id);
    const game = gameByExternal.get(q.external_game_id);
    if (!player || !game) continue;
    player_odds.push({
      id: id("odds"),
      player_id: player.id,
      game_id: game.id,
      week_id: weekId,
      sportsbook: q.sportsbook,
      market: q.market,
      american_odds: q.american_odds,
      decimal_odds: q.decimal_odds,
      implied_probability: q.implied_probability,
      fetched_at: q.fetched_at,
    });
  }

  // Pre-seed 4 picks for Joel, Mike, Chris, Ryan using top ranked available players.
  const seedPickNames = [
    { member: "Joel", prefer: "Saquon Barkley" },
    { member: "Mike", prefer: "Derrick Henry" },
    { member: "Chris", prefer: "Ja'Marr Chase" },
    { member: "Ryan", prefer: "Jahmyr Gibbs" },
  ] as const;

  const picks: Pick[] = [];
  const takenPlayerIds = new Set<string>();

  for (const seed of seedPickNames) {
    const member = members.find((m) => m.display_name === seed.member);
    if (!member) continue;

    let pwd =
      player_week_data.find((row) => {
        const p = players.find((pl) => pl.id === row.player_id);
        return p?.name === seed.prefer && !takenPlayerIds.has(row.player_id);
      }) ??
      player_week_data.find((row) => !takenPlayerIds.has(row.player_id));

    if (!pwd) continue;
    takenPlayerIds.add(pwd.player_id);

    pwd = {
      ...pwd,
      availability: "taken",
    };
    const idx = player_week_data.findIndex((r) => r.id === pwd!.id);
    if (idx >= 0) player_week_data[idx] = pwd;

    picks.push({
      id: id("pick"),
      league_id: leagueId,
      member_id: member.id,
      week_id: weekId,
      player_id: pwd.player_id,
      odds_at_selection: pwd.consensus_american_odds,
      probability_at_selection:
        pwd.market_probability ||
        impliedProbabilityFromAmerican(pwd.consensus_american_odds),
      picked_at: createdAt,
      result: "pending",
      touchdown_scored: null,
      overridden: false,
    });
  }

  return {
    leagues: [league],
    members,
    weeks: [week],
    games,
    players,
    player_week_data,
    player_odds,
    picks,
  };
}
