import { computeTdPoolScore, scoreToStars } from "@/lib/scoring/td-pool-model";
import {
  MOCK_WEEK4_GAMES,
  MOCK_WEEK4_PLAYERS,
  TEAM_TO_GAME,
} from "@/lib/providers/mock/mock-nfl-provider";
import { CONSENSUS_AMERICAN } from "@/lib/providers/mock/mock-odds-provider";
import { buildPlayerHistory } from "@/lib/providers/mock/mock-history";
import { impliedProbabilityFromAmerican } from "@/lib/utils/odds";
import type {
  InjuryStatus,
  PlayerPosition,
  ResearchJson,
  TrendDirection,
} from "@/lib/types";
import type { ConsensusOdds, ProviderGame, ProviderPlayer } from "@/lib/providers/types";

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function seededUnit(seed: string, salt: string): number {
  const h = hashString(`${seed}:${salt}`);
  return (h % 10_000) / 10_000;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function opponentOf(game: ProviderGame, team: string): string {
  return game.home_team === team ? game.away_team : game.home_team;
}

function teamImpliedPoints(game: ProviderGame, team: string): number | null {
  if (game.total == null || game.spread == null) return null;
  // Spread is from home perspective (negative = home favored).
  const homeImplied = game.total / 2 - game.spread / 2;
  const awayImplied = game.total - homeImplied;
  return game.home_team === team ? homeImplied : awayImplied;
}

function positionBase(position: PlayerPosition): {
  goalLine: number;
  share: number;
  recent: number;
} {
  switch (position) {
    case "RB":
      return { goalLine: 0.72, share: 0.58, recent: 0.62 };
    case "WR":
      return { goalLine: 0.42, share: 0.55, recent: 0.55 };
    case "TE":
      return { goalLine: 0.48, share: 0.45, recent: 0.5 };
    case "QB":
      return { goalLine: 0.35, share: 0.3, recent: 0.4 };
    default:
      return { goalLine: 0.4, share: 0.4, recent: 0.4 };
  }
}

function injuryFor(player: ProviderPlayer): {
  status: InjuryStatus;
  detail: string | null;
  healthScore: number;
} {
  const roll = seededUnit(player.external_player_id, "injury");
  if (player.external_player_id === "p-aivuk") {
    return { status: "questionable", detail: "knee", healthScore: 0.55 };
  }
  if (player.external_player_id === "p-kupp") {
    return { status: "questionable", detail: "ankle", healthScore: 0.6 };
  }
  if (roll > 0.93) {
    return { status: "questionable", detail: "hamstring", healthScore: 0.58 };
  }
  if (roll > 0.97) {
    return { status: "doubtful", detail: "shoulder", healthScore: 0.35 };
  }
  return { status: "healthy", detail: null, healthScore: 1 };
}

function weatherFor(game: ProviderGame): ResearchJson["game_environment"]["weather"] {
  if (game.is_dome) {
    return {
      temperature_f: 72,
      wind_mph: 0,
      precip_chance: 0,
      severity: "none",
      notes: "Indoor game — weather neutral.",
    };
  }
  const wind = Math.round(4 + seededUnit(game.external_game_id, "wind") * 18);
  const precip = Math.round(seededUnit(game.external_game_id, "rain") * 40);
  const temp = Math.round(55 + seededUnit(game.external_game_id, "temp") * 25);
  let severity: ResearchJson["game_environment"]["weather"]["severity"] = "none";
  if (wind >= 18 || precip >= 30) severity = "moderate";
  else if (wind >= 12 || precip >= 15) severity = "mild";
  return {
    temperature_f: temp,
    wind_mph: wind,
    precip_chance: precip,
    severity,
    notes:
      severity === "none"
        ? "Outdoor conditions look manageable for scoring."
        : "Weather may slightly suppress passing efficiency.",
  };
}

function trendFor(id: string): TrendDirection {
  const v = seededUnit(id, "trend");
  if (v > 0.66) return "up";
  if (v < 0.33) return "down";
  return "stable";
}

export interface GeneratedPlayerResearch {
  player: ProviderPlayer;
  game: ProviderGame;
  research: ResearchJson;
  marketProbability: number;
  factors: {
    goalLineRedzone: number;
    teamImplied: number;
    recentOpp: number;
    matchup: number;
    share: number;
    injury: number;
    weatherContext: number;
  };
  model: ReturnType<typeof computeTdPoolScore>;
  matchupRating: number;
  goalLineRating: number;
}

export function generatePlayerResearch(
  player: ProviderPlayer,
  consensus?: ConsensusOdds,
): GeneratedPlayerResearch | null {
  const gameId = TEAM_TO_GAME[player.team];
  const game = MOCK_WEEK4_GAMES.find((g) => g.external_game_id === gameId);
  if (!game || !player.active) return null;

  const american =
    consensus?.american_odds ??
    CONSENSUS_AMERICAN[player.external_player_id] ??
    200;
  const marketProbability =
    consensus?.implied_probability ??
    impliedProbabilityFromAmerican(american);

  const base = positionBase(player.position);
  const goalLineRedzone = clamp01(
    base.goalLine + (seededUnit(player.external_player_id, "gl") - 0.5) * 0.35,
  );
  const share = clamp01(
    base.share + (seededUnit(player.external_player_id, "share") - 0.5) * 0.3,
  );
  const recentOpp = clamp01(
    base.recent + (seededUnit(player.external_player_id, "recent") - 0.5) * 0.3,
  );
  const matchup = clamp01(
    0.35 + seededUnit(player.external_player_id, "matchup") * 0.55,
  );
  const impliedPts = teamImpliedPoints(game, player.team);
  const teamImplied = clamp01(
    impliedPts == null ? 0.5 : (impliedPts - 14) / 22,
  );
  const injury = injuryFor(player);
  const weather = weatherFor(game);
  const weatherContext =
    weather.severity === "none"
      ? 0.75
      : weather.severity === "mild"
        ? 0.55
        : weather.severity === "moderate"
          ? 0.4
          : 0.25;

  const books = consensus?.books.map((b) => ({
    sportsbook: b.sportsbook,
    american_odds: b.american_odds,
  })) ?? [
    { sportsbook: "FanDuel", american_odds: american - 5 },
    { sportsbook: "DraftKings", american_odds: american + 5 },
    { sportsbook: "Bet365", american_odds: american },
  ];

  const opponent = opponentOf(game, player.team);
  const tdsAllowed = Math.round(4 + seededUnit(opponent, "tds") * 10);
  const rzRate = Number(
    (0.4 + seededUnit(opponent, "rz") * 0.35).toFixed(2),
  );

  const whyExtra: string[] = [];
  if (goalLineRedzone > 0.65) {
    whyExtra.push(
      `${Math.round(goalLineRedzone * 100)}% relative goal-line / red-zone opportunity score`,
    );
  }
  if (impliedPts != null && impliedPts >= 24) {
    whyExtra.push(`${player.team} implied for ${impliedPts.toFixed(1)} points`);
  }
  if (matchup > 0.6) {
    whyExtra.push(
      `${opponent} has allowed ${tdsAllowed} TDs recently (favorable matchup)`,
    );
  }
  whyExtra.push(
    `Market consensus around ${Math.round(marketProbability * 100)}% TD probability`,
  );

  const concernExtra: string[] = [];
  if (injury.status !== "healthy") {
    concernExtra.push(
      `${injury.status.toUpperCase()}${injury.detail ? ` — ${injury.detail}` : ""}`,
    );
  }
  if (weather.severity !== "none") {
    concernExtra.push(weather.notes);
  }
  if (recentOpp < 0.45) {
    concernExtra.push("Recent usage softer than preferred for a top TD pool pick");
  }

  const model = computeTdPoolScore({
    marketProbability,
    goalLineRedzone,
    teamImplied,
    recentOpp,
    matchup,
    share,
    injury: injury.healthScore,
    weatherContext,
    playerName: player.name,
    whyWeLike: whyExtra,
    concerns: concernExtra,
  });

  const trend = trendFor(player.external_player_id);
  const isRunner = player.position === "RB" || player.position === "QB";
  const history = buildPlayerHistory({
    externalPlayerId: player.external_player_id,
    team: player.team,
    position: player.position,
    opponent,
    currentWeek: game.week,
    recentTrend: trend,
  });

  const research: ResearchJson = {
    why_we_like: model.whyWeLike,
    concerns: model.concerns,
    verdict: model.verdict,
    red_zone: {
      carries: isRunner ? Math.round(2 + goalLineRedzone * 5) : Math.round(goalLineRedzone * 2),
      targets: isRunner
        ? Math.round(1 + share * 2)
        : Math.round(2 + share * 5),
      touches_per_game: Number((2 + goalLineRedzone * 4).toFixed(1)),
      share: Number(share.toFixed(2)),
    },
    goal_line: {
      carries_inside_10: isRunner ? Math.round(1 + goalLineRedzone * 4) : 0,
      carries_inside_5: isRunner ? Math.round(goalLineRedzone * 3) : 0,
      team_share: Number(
        (isRunner ? 0.35 + goalLineRedzone * 0.5 : 0.05 + share * 0.2).toFixed(2),
      ),
      opportunities: Math.round(1 + goalLineRedzone * 5),
    },
    matchup: {
      opponent,
      tds_allowed: tdsAllowed,
      red_zone_td_rate: rzRate,
      rushing_tds_allowed: Math.round(tdsAllowed * 0.45),
      receiving_tds_allowed: Math.round(tdsAllowed * 0.55),
      position_rank_allowed: Math.max(
        1,
        Math.round(32 - matchup * 28),
      ),
      notes: `Matchup vs ${opponent} grades ${scoreToStars(matchup)}/5 for ${player.position} TDs.`,
    },
    usage: {
      snap_share: Number((0.4 + share * 0.45).toFixed(2)),
      carry_share: isRunner ? Number(share.toFixed(2)) : null,
      target_share: !isRunner || player.position === "RB"
        ? Number((share * (player.position === "RB" ? 0.5 : 1)).toFixed(2))
        : null,
      targets_per_game:
        player.position === "QB"
          ? null
          : Number((3 + share * 7).toFixed(1)),
      end_zone_targets:
        player.position === "QB"
          ? null
          : Math.round(seededUnit(player.external_player_id, "ez") * 4),
      recent_trend: trend,
      last_games_summary: history.last_5_summary,
    },
    history,
    game_environment: {
      spread: game.spread,
      total: game.total,
      team_implied_points: impliedPts == null ? null : Number(impliedPts.toFixed(1)),
      weather,
    },
    injuries: {
      player_status: injury.status,
      player_detail: injury.detail,
      relevant: [],
    },
    market: {
      consensus_american: american,
      consensus_implied: Number(marketProbability.toFixed(4)),
      books,
    },
  };

  return {
    player,
    game,
    research,
    marketProbability,
    factors: {
      goalLineRedzone,
      teamImplied,
      recentOpp,
      matchup,
      share,
      injury: injury.healthScore,
      weatherContext,
    },
    model,
    matchupRating: scoreToStars(matchup),
    goalLineRating: scoreToStars(goalLineRedzone),
  };
}

export function generateAllPlayerResearch(
  consensusList?: ConsensusOdds[],
): GeneratedPlayerResearch[] {
  const byId = new Map(
    (consensusList ?? []).map((c) => [c.external_player_id, c]),
  );
  const results: GeneratedPlayerResearch[] = [];

  for (const player of MOCK_WEEK4_PLAYERS) {
    if (!player.active || !TEAM_TO_GAME[player.team]) continue;
    if (!CONSENSUS_AMERICAN[player.external_player_id]) continue;
    const generated = generatePlayerResearch(player, byId.get(player.external_player_id));
    if (generated) results.push(generated);
  }

  return results.sort(
    (a, b) => b.model.ourProbability - a.model.ourProbability,
  );
}
