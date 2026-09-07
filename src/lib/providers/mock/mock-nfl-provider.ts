import { getNflWeekForDate } from "@/lib/nfl/calendar";
import type {
  NFLDataProvider,
  PlayerTouchdownResult,
  ProviderGame,
  ProviderPlayer,
  ProviderPlayerGameStats,
} from "@/lib/providers/types";

const SEASON = 2025;
const WEEK = 4;
/** Typical NFL game length used for scheduled → in_progress → final. */
const GAME_DURATION_MS = 3.5 * 60 * 60 * 1000;

/**
 * Fixed seed set so demo picks (Barkley, Henry, Chase, Gibbs) reliably score TDs
 * when games are final. Other players use deterministic hashing (~55%).
 */
const GUARANTEED_TD_PLAYER_IDS = new Set([
  "p-barkley",
  "p-henry",
  "p-chase",
  "p-gibbs",
]);

/** Week 4 2025-style mock schedule (8–10 games). */
export const MOCK_WEEK4_GAMES: ProviderGame[] = [
  {
    external_game_id: "nfl-2025-w4-buf-bal",
    season: SEASON,
    week: WEEK,
    home_team: "BAL",
    away_team: "BUF",
    kickoff_at: "2025-09-28T17:00:00.000Z",
    status: "scheduled",
    spread: -2.5,
    total: 48.5,
    stadium: "M&T Bank Stadium",
    is_dome: false,
    home_score: null,
    away_score: null,
  },
  {
    external_game_id: "nfl-2025-w4-phi-tb",
    season: SEASON,
    week: WEEK,
    home_team: "TB",
    away_team: "PHI",
    kickoff_at: "2025-09-28T17:00:00.000Z",
    status: "scheduled",
    spread: 3.5,
    total: 47.0,
    stadium: "Raymond James Stadium",
    is_dome: false,
    home_score: null,
    away_score: null,
  },
  {
    external_game_id: "nfl-2025-w4-det-dal",
    season: SEASON,
    week: WEEK,
    home_team: "DAL",
    away_team: "DET",
    kickoff_at: "2025-09-28T17:00:00.000Z",
    status: "scheduled",
    spread: -1.5,
    total: 51.5,
    stadium: "AT&T Stadium",
    is_dome: true,
    home_score: null,
    away_score: null,
  },
  {
    external_game_id: "nfl-2025-w4-kc-lac",
    season: SEASON,
    week: WEEK,
    home_team: "LAC",
    away_team: "KC",
    kickoff_at: "2025-09-28T20:25:00.000Z",
    status: "scheduled",
    spread: 1.5,
    total: 46.5,
    stadium: "SoFi Stadium",
    is_dome: true,
    home_score: null,
    away_score: null,
  },
  {
    external_game_id: "nfl-2025-w4-sf-lar",
    season: SEASON,
    week: WEEK,
    home_team: "LAR",
    away_team: "SF",
    kickoff_at: "2025-09-28T20:25:00.000Z",
    status: "scheduled",
    spread: -3.0,
    total: 45.5,
    stadium: "SoFi Stadium",
    is_dome: true,
    home_score: null,
    away_score: null,
  },
  {
    external_game_id: "nfl-2025-w4-mia-ne",
    season: SEASON,
    week: WEEK,
    home_team: "NE",
    away_team: "MIA",
    kickoff_at: "2025-09-28T17:00:00.000Z",
    status: "scheduled",
    spread: -2.0,
    total: 42.5,
    stadium: "Gillette Stadium",
    is_dome: false,
    home_score: null,
    away_score: null,
  },
  {
    external_game_id: "nfl-2025-w4-cin-den",
    season: SEASON,
    week: WEEK,
    home_team: "DEN",
    away_team: "CIN",
    kickoff_at: "2025-09-29T00:20:00.000Z",
    status: "scheduled",
    spread: -1.0,
    total: 44.0,
    stadium: "Empower Field",
    is_dome: false,
    home_score: null,
    away_score: null,
  },
  {
    external_game_id: "nfl-2025-w4-gb-min",
    season: SEASON,
    week: WEEK,
    home_team: "MIN",
    away_team: "GB",
    kickoff_at: "2025-09-28T17:00:00.000Z",
    status: "scheduled",
    spread: -2.5,
    total: 43.5,
    stadium: "U.S. Bank Stadium",
    is_dome: true,
    home_score: null,
    away_score: null,
  },
  {
    external_game_id: "nfl-2025-w4-hou-ind",
    season: SEASON,
    week: WEEK,
    home_team: "IND",
    away_team: "HOU",
    kickoff_at: "2025-09-28T17:00:00.000Z",
    status: "scheduled",
    spread: 3.0,
    total: 44.5,
    stadium: "Lucas Oil Stadium",
    is_dome: true,
    home_score: null,
    away_score: null,
  },
  {
    external_game_id: "nfl-2025-w4-sea-ari",
    season: SEASON,
    week: WEEK,
    home_team: "ARI",
    away_team: "SEA",
    kickoff_at: "2025-09-25T00:15:00.000Z",
    status: "scheduled",
    spread: -1.5,
    total: 45.0,
    stadium: "State Farm Stadium",
    is_dome: true,
    home_score: null,
    away_score: null,
  },
];

/** ~40 skill-position players across Week 4 matchups. */
export const MOCK_WEEK4_PLAYERS: ProviderPlayer[] = [
  // BUF @ BAL
  { external_player_id: "p-barkley", name: "Saquon Barkley", team: "PHI", position: "RB", active: true, jersey_number: 26, headshot_url: null },
  { external_player_id: "p-henry", name: "Derrick Henry", team: "BAL", position: "RB", active: true, jersey_number: 22, headshot_url: null },
  { external_player_id: "p-allen", name: "Josh Allen", team: "BUF", position: "QB", active: true, jersey_number: 17, headshot_url: null },
  { external_player_id: "p-cook", name: "James Cook", team: "BUF", position: "RB", active: true, jersey_number: 4, headshot_url: null },
  { external_player_id: "p-flowers", name: "Zay Flowers", team: "BAL", position: "WR", active: true, jersey_number: 4, headshot_url: null },
  { external_player_id: "p-andrews", name: "Mark Andrews", team: "BAL", position: "TE", active: true, jersey_number: 89, headshot_url: null },
  // PHI @ TB
  { external_player_id: "p-brown", name: "A.J. Brown", team: "PHI", position: "WR", active: true, jersey_number: 11, headshot_url: null },
  { external_player_id: "p-smith", name: "DeVonta Smith", team: "PHI", position: "WR", active: true, jersey_number: 6, headshot_url: null },
  { external_player_id: "p-hurts", name: "Jalen Hurts", team: "PHI", position: "QB", active: true, jersey_number: 1, headshot_url: null },
  { external_player_id: "p-irving", name: "Bucky Irving", team: "TB", position: "RB", active: true, jersey_number: 7, headshot_url: null },
  { external_player_id: "p-evans", name: "Mike Evans", team: "TB", position: "WR", active: true, jersey_number: 13, headshot_url: null },
  { external_player_id: "p-godwin", name: "Chris Godwin", team: "TB", position: "WR", active: true, jersey_number: 14, headshot_url: null },
  // DET @ DAL
  { external_player_id: "p-gibbs", name: "Jahmyr Gibbs", team: "DET", position: "RB", active: true, jersey_number: 0, headshot_url: null },
  { external_player_id: "p-montgomery", name: "David Montgomery", team: "DET", position: "RB", active: true, jersey_number: 5, headshot_url: null },
  { external_player_id: "p-stbrown", name: "Amon-Ra St. Brown", team: "DET", position: "WR", active: true, jersey_number: 14, headshot_url: null },
  { external_player_id: "p-laporta", name: "Sam LaPorta", team: "DET", position: "TE", active: true, jersey_number: 87, headshot_url: null },
  { external_player_id: "p-lamb", name: "CeeDee Lamb", team: "DAL", position: "WR", active: true, jersey_number: 88, headshot_url: null },
  { external_player_id: "p-prescott", name: "Dak Prescott", team: "DAL", position: "QB", active: true, jersey_number: 4, headshot_url: null },
  { external_player_id: "p-williams-j", name: "Javonte Williams", team: "DAL", position: "RB", active: true, jersey_number: 33, headshot_url: null },
  // KC @ LAC
  { external_player_id: "p-mahomes", name: "Patrick Mahomes", team: "KC", position: "QB", active: true, jersey_number: 15, headshot_url: null },
  { external_player_id: "p-kelce", name: "Travis Kelce", team: "KC", position: "TE", active: true, jersey_number: 87, headshot_url: null },
  { external_player_id: "p-pacheco", name: "Isiah Pacheco", team: "KC", position: "RB", active: true, jersey_number: 10, headshot_url: null },
  { external_player_id: "p-worthy", name: "Xavier Worthy", team: "KC", position: "WR", active: true, jersey_number: 1, headshot_url: null },
  { external_player_id: "p-herbert", name: "Justin Herbert", team: "LAC", position: "QB", active: true, jersey_number: 10, headshot_url: null },
  { external_player_id: "p-johnston", name: "Quentin Johnston", team: "LAC", position: "WR", active: true, jersey_number: 1, headshot_url: null },
  { external_player_id: "p-dobbins", name: "J.K. Dobbins", team: "LAC", position: "RB", active: true, jersey_number: 27, headshot_url: null },
  // SF @ LAR
  { external_player_id: "p-mccaffrey", name: "Christian McCaffrey", team: "SF", position: "RB", active: true, jersey_number: 23, headshot_url: null },
  { external_player_id: "p-aivuk", name: "Brandon Aiyuk", team: "SF", position: "WR", active: true, jersey_number: 11, headshot_url: null },
  { external_player_id: "p-kittle", name: "George Kittle", team: "SF", position: "TE", active: true, jersey_number: 85, headshot_url: null },
  { external_player_id: "p-kyren", name: "Kyren Williams", team: "LAR", position: "RB", active: true, jersey_number: 23, headshot_url: null },
  { external_player_id: "p-puka", name: "Puka Nacua", team: "LAR", position: "WR", active: true, jersey_number: 17, headshot_url: null },
  { external_player_id: "p-kupp", name: "Cooper Kupp", team: "LAR", position: "WR", active: true, jersey_number: 10, headshot_url: null },
  // MIA @ NE
  { external_player_id: "p-achane", name: "De'Von Achane", team: "MIA", position: "RB", active: true, jersey_number: 28, headshot_url: null },
  { external_player_id: "p-waddle", name: "Jaylen Waddle", team: "MIA", position: "WR", active: true, jersey_number: 17, headshot_url: null },
  { external_player_id: "p-hill", name: "Tyreek Hill", team: "MIA", position: "WR", active: true, jersey_number: 10, headshot_url: null },
  { external_player_id: "p-stevenson", name: "Rhamondre Stevenson", team: "NE", position: "RB", active: true, jersey_number: 38, headshot_url: null },
  { external_player_id: "p-maye", name: "Drake Maye", team: "NE", position: "QB", active: true, jersey_number: 10, headshot_url: null },
  // CIN @ DEN
  { external_player_id: "p-chase", name: "Ja'Marr Chase", team: "CIN", position: "WR", active: true, jersey_number: 1, headshot_url: null },
  { external_player_id: "p-higgins", name: "Tee Higgins", team: "CIN", position: "WR", active: true, jersey_number: 5, headshot_url: null },
  { external_player_id: "p-mixon", name: "Joe Mixon", team: "HOU", position: "RB", active: true, jersey_number: 28, headshot_url: null },
  { external_player_id: "p-williams-c", name: "Caleb Williams", team: "CHI", position: "QB", active: false, jersey_number: 18, headshot_url: null },
  { external_player_id: "p-nix", name: "Bo Nix", team: "DEN", position: "QB", active: true, jersey_number: 10, headshot_url: null },
  { external_player_id: "p-sutton", name: "Courtland Sutton", team: "DEN", position: "WR", active: true, jersey_number: 14, headshot_url: null },
  // GB @ MIN
  { external_player_id: "p-jacobs", name: "Josh Jacobs", team: "GB", position: "RB", active: true, jersey_number: 8, headshot_url: null },
  { external_player_id: "p-doubs", name: "Romeo Doubs", team: "GB", position: "WR", active: true, jersey_number: 87, headshot_url: null },
  { external_player_id: "p-jefferson", name: "Justin Jefferson", team: "MIN", position: "WR", active: true, jersey_number: 18, headshot_url: null },
  { external_player_id: "p-aaronjones", name: "Aaron Jones", team: "MIN", position: "RB", active: true, jersey_number: 33, headshot_url: null },
  // HOU @ IND
  { external_player_id: "p-collins", name: "Nico Collins", team: "HOU", position: "WR", active: true, jersey_number: 12, headshot_url: null },
  { external_player_id: "p-stroud", name: "C.J. Stroud", team: "HOU", position: "QB", active: true, jersey_number: 7, headshot_url: null },
  { external_player_id: "p-taylor", name: "Jonathan Taylor", team: "IND", position: "RB", active: true, jersey_number: 28, headshot_url: null },
  { external_player_id: "p-pittman", name: "Michael Pittman Jr.", team: "IND", position: "WR", active: true, jersey_number: 11, headshot_url: null },
  // SEA @ ARI
  { external_player_id: "p-walker", name: "Kenneth Walker III", team: "SEA", position: "RB", active: true, jersey_number: 9, headshot_url: null },
  { external_player_id: "p-metcalf", name: "DK Metcalf", team: "SEA", position: "WR", active: true, jersey_number: 14, headshot_url: null },
  { external_player_id: "p-conner", name: "James Conner", team: "ARI", position: "RB", active: true, jersey_number: 6, headshot_url: null },
  { external_player_id: "p-mhj", name: "Marvin Harrison Jr.", team: "ARI", position: "WR", active: true, jersey_number: 18, headshot_url: null },
];

/** Team → game mapping for Week 4. */
export const TEAM_TO_GAME: Record<string, string> = {
  BUF: "nfl-2025-w4-buf-bal",
  BAL: "nfl-2025-w4-buf-bal",
  PHI: "nfl-2025-w4-phi-tb",
  TB: "nfl-2025-w4-phi-tb",
  DET: "nfl-2025-w4-det-dal",
  DAL: "nfl-2025-w4-det-dal",
  KC: "nfl-2025-w4-kc-lac",
  LAC: "nfl-2025-w4-kc-lac",
  SF: "nfl-2025-w4-sf-lar",
  LAR: "nfl-2025-w4-sf-lar",
  MIA: "nfl-2025-w4-mia-ne",
  NE: "nfl-2025-w4-mia-ne",
  CIN: "nfl-2025-w4-cin-den",
  DEN: "nfl-2025-w4-cin-den",
  GB: "nfl-2025-w4-gb-min",
  MIN: "nfl-2025-w4-gb-min",
  HOU: "nfl-2025-w4-hou-ind",
  IND: "nfl-2025-w4-hou-ind",
  SEA: "nfl-2025-w4-sea-ari",
  ARI: "nfl-2025-w4-sea-ari",
};

const MOCK_RECENT_STATS: Record<string, ProviderPlayerGameStats[]> = {
  "p-barkley": [
    {
      external_player_id: "p-barkley",
      external_game_id: "prior-1",
      rushes: 22,
      targets: 4,
      receptions: 3,
      rush_yards: 109,
      receiving_yards: 28,
      touchdowns: 1,
      red_zone_touches: 5,
      goal_line_carries: 3,
      snap_share: 0.82,
    },
  ],
  "p-henry": [
    {
      external_player_id: "p-henry",
      external_game_id: "prior-1",
      rushes: 18,
      targets: 1,
      receptions: 1,
      rush_yards: 96,
      receiving_yards: 6,
      touchdowns: 2,
      red_zone_touches: 4,
      goal_line_carries: 3,
      snap_share: 0.64,
    },
  ],
};

function assertWeek(season: number, week: number): void {
  if (season !== SEASON || week !== WEEK) {
    // Mock provider only ships Week 4 2025; return empty for other weeks.
  }
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mockFinalScores(game: ProviderGame): {
  home_score: number;
  away_score: number;
} {
  const h = hashString(game.external_game_id);
  const home = 10 + (h % 28);
  const away = 7 + ((h >>> 8) % 31);
  // Avoid ties for cleaner demos.
  if (home === away) {
    return { home_score: home + 3, away_score: away };
  }
  return { home_score: home, away_score: away };
}

function statusForKickoff(
  kickoffAt: string,
  asOf: Date,
): ProviderGame["status"] {
  const kickoff = new Date(kickoffAt).getTime();
  const t = asOf.getTime();
  if (t < kickoff) return "scheduled";
  if (t < kickoff + GAME_DURATION_MS) return "in_progress";
  return "final";
}

function playerScoredTd(externalPlayerId: string): boolean {
  if (GUARANTEED_TD_PLAYER_IDS.has(externalPlayerId)) return true;
  // ~55% of remaining skill players score when final.
  return hashString(`td:${externalPlayerId}`) % 100 < 55;
}

function tdCountForPlayer(externalPlayerId: string): number {
  if (!playerScoredTd(externalPlayerId)) return 0;
  const h = hashString(`tdcount:${externalPlayerId}`);
  return 1 + (h % 3 === 0 ? 1 : 0); // mostly 1, occasionally 2
}

export class MockNFLProvider implements NFLDataProvider {
  async getWeekSchedule(season: number, week: number): Promise<ProviderGame[]> {
    assertWeek(season, week);
    if (season !== SEASON || week !== WEEK) return [];
    return MOCK_WEEK4_GAMES.map((g) => ({ ...g }));
  }

  async getPlayersForWeek(season: number, week: number): Promise<ProviderPlayer[]> {
    assertWeek(season, week);
    if (season !== SEASON || week !== WEEK) return [];
    return MOCK_WEEK4_PLAYERS.filter((p) => p.active && TEAM_TO_GAME[p.team]).map(
      (p) => ({ ...p }),
    );
  }

  async getPlayerByExternalId(
    externalPlayerId: string,
  ): Promise<ProviderPlayer | null> {
    const player = MOCK_WEEK4_PLAYERS.find(
      (p) => p.external_player_id === externalPlayerId,
    );
    return player ? { ...player } : null;
  }

  async getGameByExternalId(
    externalGameId: string,
  ): Promise<ProviderGame | null> {
    const game = MOCK_WEEK4_GAMES.find((g) => g.external_game_id === externalGameId);
    return game ? { ...game } : null;
  }

  async getRecentPlayerStats(
    externalPlayerId: string,
    lastN = 3,
  ): Promise<ProviderPlayerGameStats[]> {
    const stats = MOCK_RECENT_STATS[externalPlayerId] ?? [];
    return stats.slice(0, lastN).map((s) => ({ ...s }));
  }

  async getCurrentWeek(
    asOf: Date = new Date(),
  ): Promise<{ season: number; week: number }> {
    const mapped = getNflWeekForDate(asOf, SEASON) ?? getNflWeekForDate(asOf);
    if (mapped) return mapped;
    // Default demo week when outside the calendar window.
    return { season: SEASON, week: WEEK };
  }

  async refreshGameStatuses(
    season: number,
    week: number,
    asOf: Date = new Date(),
  ): Promise<ProviderGame[]> {
    const schedule = await this.getWeekSchedule(season, week);
    return schedule.map((game) => {
      const status = statusForKickoff(game.kickoff_at, asOf);
      if (status === "final") {
        const scores = mockFinalScores(game);
        return {
          ...game,
          status,
          home_score: scores.home_score,
          away_score: scores.away_score,
        };
      }
      if (status === "in_progress") {
        const scores = mockFinalScores(game);
        // Partial score while live.
        return {
          ...game,
          status,
          home_score: Math.floor(scores.home_score / 2),
          away_score: Math.floor(scores.away_score / 2),
        };
      }
      return {
        ...game,
        status: "scheduled",
        home_score: null,
        away_score: null,
      };
    });
  }

  async getPlayerTouchdownsForWeek(
    season: number,
    week: number,
    asOf: Date = new Date(),
  ): Promise<PlayerTouchdownResult[]> {
    const games = await this.refreshGameStatuses(season, week, asOf);
    const gamesByExternal = new Map(
      games.map((g) => [g.external_game_id, g] as const),
    );
    const players = await this.getPlayersForWeek(season, week);

    return players.map((player) => {
      const externalGameId = TEAM_TO_GAME[player.team];
      const game = externalGameId
        ? gamesByExternal.get(externalGameId)
        : undefined;
      const game_status = game?.status ?? "scheduled";
      if (game_status !== "final") {
        return {
          external_player_id: player.external_player_id,
          external_game_id: externalGameId ?? "",
          touchdowns: 0,
          game_status,
        };
      }
      return {
        external_player_id: player.external_player_id,
        external_game_id: externalGameId ?? "",
        touchdowns: tdCountForPlayer(player.external_player_id),
        game_status,
      };
    });
  }
}

export function createMockNFLProvider(): NFLDataProvider {
  return new MockNFLProvider();
}
