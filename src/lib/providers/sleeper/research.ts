import type {
  PlayerPosition,
  TdTier,
  ResearchGameLog,
  ResearchHistory,
  ResearchJson,
  TrendDirection,
} from "@/lib/types";
import type { ProviderGame, WeatherReport } from "@/lib/providers/types";
import {
  getSleeperSchedule,
  getSleeperWeekStats,
  opponentFromSchedule,
  rzTouchesFromStat,
  touchdownsFromStat,
  type SleeperScheduleGame,
  type SleeperWeekStat,
} from "@/lib/providers/sleeper/client";
import { mapWithConcurrency } from "@/lib/concurrency";

/** Rolling window used to rate scoring ability. One season of games. */
export const SCORING_SAMPLE_GAMES = 17;

function emptyHistory(): ResearchHistory {
  return {
    last_5: [],
    vs_opponent: [],
    last_5_summary: "No recent game logs yet.",
    vs_opponent_summary: "No prior meetings found.",
    recent_trend: "stable",
    scoring_sample: { games: 0, touchdowns: 0 },
  };
}

function trendFromLogs(logs: ResearchGameLog[]): TrendDirection {
  if (logs.length < 2) return "stable";
  const recent = logs.slice(0, 2).reduce((s, g) => s + g.touchdowns, 0);
  const older = logs.slice(2).reduce((s, g) => s + g.touchdowns, 0);
  const recentAvg = recent / Math.min(2, logs.length);
  const olderAvg = older / Math.max(1, logs.length - 2);
  if (recentAvg > olderAvg + 0.25) return "up";
  if (recentAvg < olderAvg - 0.25) return "down";
  return "stable";
}

function summarizeLast5(logs: ResearchGameLog[]): string {
  if (!logs.length) return "No recent game logs yet.";
  const sum = (pick: (g: ResearchGameLog) => number) =>
    logs.reduce((s, g) => s + pick(g), 0);
  const parts = [
    `${sum((g) => g.touchdowns)} TD`,
    `${sum((g) => g.rz_touches)} RZ touches`,
  ];
  const rushYd = sum((g) => g.rush_yards);
  const recYd = sum((g) => g.receiving_yards);
  if (rushYd > 0) parts.push(`${sum((g) => g.carries)} car / ${rushYd} yds`);
  if (recYd > 0) parts.push(`${sum((g) => g.receptions)} rec / ${recYd} yds`);
  return `Last ${logs.length}: ${parts.join(" · ")}`;
}

function summarizeVs(logs: ResearchGameLog[], opponent: string): string {
  if (!logs.length) return `No prior meetings vs ${opponent}.`;
  const tds = logs.reduce((s, g) => s + g.touchdowns, 0);
  const seasons = logs
    .map((g) => g.season)
    .filter((s): s is number => typeof s === "number");
  // Meetings can span many years, so say when they were rather than implying
  // these are recent games.
  const span =
    seasons.length && Math.min(...seasons) !== Math.max(...seasons)
      ? ` since ${Math.min(...seasons)}`
      : seasons.length
        ? ` in ${seasons[0]}`
        : "";
  const label = logs.length === 1 ? "1 meeting" : `last ${logs.length} meetings`;
  const rz = logs.reduce((s, g) => s + g.rz_touches, 0);
  const rzBit =
    rz > 0 ? ` · avg RZ ${(rz / logs.length).toFixed(1)}` : "";
  return `Vs ${opponent} (${label}${span}): ${tds} TD${rzBit}`;
}

function toLog(
  week: number,
  opponent: string,
  home: boolean,
  stat: SleeperWeekStat,
  season?: number,
): ResearchGameLog {
  return {
    week,
    season,
    opponent,
    home,
    touchdowns: touchdownsFromStat(stat),
    rz_touches: rzTouchesFromStat(stat),
    carries: Math.round(Number(stat.rush_att ?? 0)),
    rush_yards: Math.round(Number(stat.rush_yd ?? 0)),
    receptions: Math.round(Number(stat.rec ?? 0)),
    receiving_yards: Math.round(Number(stat.rec_yd ?? 0)),
    goal_line_chances: Math.max(
      0,
      Math.round(Number(stat.rush_rz_att ?? 0) * 0.55),
    ),
  };
}

export type HistoryContext = {
  schedules: Map<number, SleeperScheduleGame[]>;
  /** key `${season}-${week}` → stats by sleeper player id */
  weekStats: Map<string, Map<string, SleeperWeekStat>>;
  weeksToScan: Array<{ season: number; week: number }>;
  /** Older meetings vs this week's opponent, by sleeper id, newest first. */
  deepVsOpponent?: DeepVsOpponentIndex;
};

/** Most prior meetings shown for a matchup. */
export const VS_OPPONENT_MAX = 5;

export type DeepVsOpponentIndex = Map<string, ResearchGameLog[]>;

/** Prefetch schedules + weekly stats used for last-5 / vs-opp research. */
export async function prefetchHistoryContext(args: {
  beforeSeason: number;
  beforeWeek: number;
}): Promise<HistoryContext> {
  const seasons = [args.beforeSeason, args.beforeSeason - 1].filter(
    (s) => s >= 2022,
  );
  const schedules = new Map<number, SleeperScheduleGame[]>();
  const weeksToScan: Array<{ season: number; week: number }> = [];

  for (const season of seasons) {
    schedules.set(season, await getSleeperSchedule(season));
    const maxWeek =
      season === args.beforeSeason ? Math.max(0, args.beforeWeek - 1) : 18;
    // Scan all completed weeks so vs-opponent H2H (e.g. SF–LAR in weeks 5/10)
    // is not missed. last_5 still takes the most recent five from this ordered list.
    for (let week = maxWeek; week >= 1; week -= 1) {
      weeksToScan.push({ season, week });
    }
  }

  // Bounded: a full-season scan is 18–35 weeks and Sleeper rate-limits bursts.
  const weekStats = new Map<string, Map<string, SleeperWeekStat>>();
  await mapWithConcurrency(weeksToScan, 6, async ({ season, week }) => {
    weekStats.set(`${season}-${week}`, await getSleeperWeekStats(season, week));
  });

  return { schedules, weekStats, weeksToScan };
}

/**
 * Build last-5 + vs-opponent history from prefetched Sleeper weekly stats.
 */
export function buildLivePlayerHistoryFromContext(args: {
  sleeperPlayerId: string;
  team: string;
  opponent: string;
  ctx: HistoryContext;
}): ResearchHistory {
  try {
    const last5: ResearchGameLog[] = [];
    const vsOpp: ResearchGameLog[] = [];
    let sampleGames = 0;
    let sampleTds = 0;

    for (const { season, week } of args.ctx.weeksToScan) {
      const stats = args.ctx.weekStats.get(`${season}-${week}`);
      const schedule = args.ctx.schedules.get(season) ?? [];
      const stat = stats?.get(args.sleeperPlayerId);
      if (!stat || Number(stat.gp ?? 0) < 1) continue;

      const teamForWeek = String(stat.team ?? args.team);
      const matchup =
        opponentFromSchedule(schedule, teamForWeek, week) ??
        (stat.opponent
          ? { opponent: String(stat.opponent), home: true }
          : null);
      if (!matchup) continue;

      const log = toLog(week, matchup.opponent, matchup.home, stat, season);
      if (last5.length < 5) last5.push(log);
      if (sampleGames < SCORING_SAMPLE_GAMES) {
        sampleGames += 1;
        sampleTds += log.touchdowns;
      }
      if (matchup.opponent === args.opponent && vsOpp.length < VS_OPPONENT_MAX) {
        vsOpp.push(log);
      }
      // Meetings are scattered across the whole window, so keep scanning until
      // the quota is filled even after last-5 and the scoring sample are done.
      // This is Map lookups over ~35 prefetched weeks, so it costs no requests.
      if (
        last5.length >= 5 &&
        sampleGames >= SCORING_SAMPLE_GAMES &&
        vsOpp.length >= VS_OPPONENT_MAX
      ) {
        break;
      }
    }

    // Career meetings from nflverse, merged with Sleeper rows so recency
    // order is global. Keep the Sleeper copy of a week when both exist —
    // those have red-zone touches.
    {
      const byWeek = new Map<string, ResearchGameLog>();
      const deeper = args.ctx.deepVsOpponent?.get(args.sleeperPlayerId) ?? [];
      for (const log of deeper) {
        byWeek.set(`${log.season ?? ""}-${log.week}-${log.opponent}`, log);
      }
      for (const log of vsOpp) {
        byWeek.set(`${log.season ?? ""}-${log.week}-${log.opponent}`, log);
      }
      vsOpp.length = 0;
      vsOpp.push(
        ...[...byWeek.values()]
          .sort((a, b) => {
            const season = (b.season ?? 0) - (a.season ?? 0);
            return season !== 0 ? season : b.week - a.week;
          })
          .slice(0, VS_OPPONENT_MAX),
      );
    }

    return {
      last_5: last5,
      vs_opponent: vsOpp,
      last_5_summary: summarizeLast5(last5),
      vs_opponent_summary: summarizeVs(vsOpp, args.opponent),
      recent_trend: trendFromLogs(last5),
      scoring_sample: { games: sampleGames, touchdowns: sampleTds },
    };
  } catch {
    return emptyHistory();
  }
}

export async function buildLivePlayerHistory(args: {
  sleeperPlayerId: string;
  team: string;
  opponent: string;
  beforeSeason: number;
  beforeWeek: number;
}): Promise<ResearchHistory> {
  const ctx = await prefetchHistoryContext({
    beforeSeason: args.beforeSeason,
    beforeWeek: args.beforeWeek,
  });
  return buildLivePlayerHistoryFromContext({
    sleeperPlayerId: args.sleeperPlayerId,
    team: args.team,
    opponent: args.opponent,
    ctx,
  });
}

export function buildResearchFromLive(args: {
  playerName: string;
  team: string;
  position: PlayerPosition;
  opponent: string;
  game: ProviderGame;
  history: ResearchHistory;
  weather: WeatherReport;
  injuryStatus: ResearchJson["injuries"]["player_status"];
  injuryDetail: string | null;
}): ResearchJson {
  const { history, weather, game } = args;
  const last5Tds = history.last_5.reduce((s, g) => s + g.touchdowns, 0);
  const last5Rz = history.last_5.reduce((s, g) => s + g.rz_touches, 0);
  const vsTds = history.vs_opponent.reduce((s, g) => s + g.touchdowns, 0);
  const wet =
    !weather.is_dome &&
    ((weather.precip_chance ?? 0) >= 40 || weather.severity !== "none");

  const why: string[] = [];
  const concerns: string[] = [];

  if (last5Tds >= 3) {
    why.push(`Scored ${last5Tds} TDs across last ${history.last_5.length} games.`);
  } else if (last5Tds >= 1) {
    why.push(
      `Found the end zone recently (${last5Tds} TD in last ${history.last_5.length}).`,
    );
  }
  if (last5Rz >= 8) {
    why.push(
      `Strong red-zone involvement (${last5Rz} RZ touches in last ${history.last_5.length}).`,
    );
  }
  if (history.vs_opponent.length && vsTds > 0) {
    why.push(
      `Has scored vs ${args.opponent} before (${vsTds} TD in prior meetings).`,
    );
  }
  if (game.total != null && game.total >= 46) {
    why.push(`Elevated game environment (O/U ${game.total}).`);
  }

  if (history.last_5.length && last5Tds === 0) {
    concerns.push("No TDs in the recent sample — TD equity needs a spike.");
  }
  if (wet && (args.position === "WR" || args.position === "TE")) {
    concerns.push(
      `Weather risk (${weather.notes}) — passing volume can dip in rain/wind.`,
    );
  }
  if (wet && args.position === "RB") {
    why.push(
      `Outdoor weather in play — rushing share sometimes rises when games get ugly.`,
    );
  }
  if (args.injuryStatus !== "healthy") {
    concerns.push(args.injuryDetail || `Injury tag: ${args.injuryStatus}`);
  }

  if (!why.length) why.push("Watch usage and red-zone role as kickoff approaches.");
  if (!concerns.length) concerns.push("Monitor late-week injury + weather updates.");

  const avgRz =
    history.last_5.length > 0 ? last5Rz / history.last_5.length : 0;
  const glAvg =
    history.last_5.length > 0
      ? history.last_5.reduce((s, g) => s + g.goal_line_chances, 0) /
        history.last_5.length
      : 0;

  const impliedHome =
    game.total != null && game.spread != null
      ? (game.total - game.spread) / 2
      : null;
  const impliedAway =
    game.total != null && game.spread != null
      ? (game.total + game.spread) / 2
      : null;
  const teamImplied =
    args.team === game.home_team ? impliedHome : impliedAway;

  return {
    why_we_like: why,
    concerns,
    verdict:
      last5Tds >= 3
        ? "Strong recent TD form — featured anytime profile."
        : last5Rz >= 6
          ? "Red-zone role is the path to a TD this week."
          : "Solid pool name if price / role hold through Sunday.",
    red_zone: {
      carries: Math.round(avgRz * (args.position === "RB" ? 0.7 : 0.25)),
      targets: Math.round(avgRz * (args.position === "RB" ? 0.3 : 0.75)),
      touches_per_game: Number(avgRz.toFixed(1)),
      share: Math.min(0.45, avgRz / 12),
    },
    goal_line: {
      carries_inside_10: Math.round(glAvg),
      carries_inside_5: Math.max(0, Math.round(glAvg * 0.55)),
      team_share: Math.min(0.4, glAvg / 5),
      opportunities: Math.round(glAvg * (history.last_5.length || 0)),
    },
    matchup: {
      opponent: args.opponent,
      tds_allowed: 0,
      red_zone_td_rate: 0.2,
      rushing_tds_allowed: 0,
      receiving_tds_allowed: 0,
      position_rank_allowed: 16,
      notes: history.vs_opponent_summary,
    },
    usage: {
      // Derive from recent RZ involvement so RBs aren't all identical.
      snap_share: Math.min(0.85, avgRz / 7),
      carry_share:
        args.position === "RB"
          ? Math.min(0.7, Math.max(0.08, avgRz / 9))
          : 0,
      target_share:
        args.position === "RB"
          ? Math.min(0.18, Math.max(0.02, avgRz * 0.025))
          : Math.min(0.35, Math.max(0.06, avgRz / 10)),
      targets_per_game:
        args.position === "RB"
          ? Math.min(6, Math.max(1, Number((avgRz * 0.45).toFixed(1))))
          : Math.min(12, Math.max(2, Number((avgRz * 1.1).toFixed(1)))),
      end_zone_targets: Math.round(glAvg),
      recent_trend: history.recent_trend,
      last_games_summary: history.last_5_summary,
    },
    history,
    game_environment: {
      spread: game.spread,
      total: game.total,
      team_implied_points: teamImplied,
      weather: {
        temperature_f: weather.temperature_f,
        wind_mph: weather.wind_mph,
        precip_chance: weather.precip_chance,
        severity: weather.severity,
        notes: weather.notes,
      },
    },
    injuries: {
      player_status: args.injuryStatus,
      player_detail: args.injuryDetail,
      relevant: [],
    },
    market: {
      consensus_american: 0,
      consensus_implied: 0,
      books: [],
    },
  };
}

export function scoreTdPoolFromResearch(research: ResearchJson): {
  score: number;
  our_probability: number;
  matchup_rating: number;
  goal_line_rating: number;
  tier: TdTier;
} {
  const hist = research.history;
  const games = hist?.last_5.length ?? 0;
  const n = Math.max(1, games);
  const tds = hist?.last_5.reduce((s, g) => s + g.touchdowns, 0) ?? 0;
  const rz = hist?.last_5.reduce((s, g) => s + g.rz_touches, 0) ?? 0;
  const gl = hist?.last_5.reduce((s, g) => s + g.goal_line_chances, 0) ?? 0;
  const vs = hist?.vs_opponent.reduce((s, g) => s + g.touchdowns, 0) ?? 0;
  const vsGames = hist?.vs_opponent.length ?? 0;

  const tdRate = tds / n; // rush/rec TDs per recent game
  const rzRate = rz / n;
  const glRate = gl / n;
  const vsRate = vsGames > 0 ? vs / vsGames : 0;

  const carry = research.usage.carry_share ?? 0;
  const tgt = research.usage.target_share ?? 0;
  const implied = research.game_environment.team_implied_points ?? 21;

  // Poisson-ish anytime TD probability from recent TD rate, then layer usage.
  let our = 1 - Math.exp(-Math.max(0, tdRate) * 1.15);
  our += Math.min(0.1, rzRate * 0.015);
  our += Math.min(0.08, glRate * 0.025);
  our += Math.min(0.05, vsRate * 0.04);
  our += carry * 0.14 + tgt * 0.12;
  our += Math.min(0.04, Math.max(-0.03, (implied - 22) * 0.004));

  const total = research.game_environment.total;
  if (total != null && total >= 48) our += 0.015;
  if (total != null && total <= 40) our -= 0.01;

  if (research.game_environment.weather.severity === "severe") {
    if (carry >= 0.25) our += 0.01;
    else our -= 0.015;
  }

  if (research.injuries.player_status === "questionable") our *= 0.92;
  if (research.injuries.player_status === "doubtful") our *= 0.75;
  if (
    research.injuries.player_status === "out" ||
    research.injuries.player_status === "injured_reserve"
  ) {
    our *= 0.15;
  }

  // Keep display probabilities in a realistic anytime-TD band, but stay granular.
  const our_probability = Math.max(0.04, Math.min(0.52, our));

  // Rank score must stay discriminative even when probabilities cluster.
  // Do NOT equal score to capped probability.
  const score =
    tdRate * 1000 +
    rzRate * 45 +
    glRate * 70 +
    vsRate * 120 +
    carry * 220 +
    tgt * 180 +
    implied * 4 +
    our_probability * 80 +
    (total ?? 44) * 0.5 -
    (research.injuries.player_status === "questionable" ? 40 : 0);

  const matchup_rating = Math.max(
    1,
    Math.min(
      5,
      Math.round(
        2.2 +
          vsRate * 1.5 +
          ((total ?? 44) - 44) / 8 +
          (research.game_environment.weather.severity === "none" ? 0.2 : 0),
      ),
    ),
  );
  const goal_line_rating = Math.max(
    1,
    Math.min(5, Math.round(1.2 + glRate * 1.1 + rzRate * 0.35)),
  );

  const tier: TdTier =
    our_probability >= 0.32
      ? "elite"
      : our_probability >= 0.24
        ? "strong"
        : our_probability >= 0.16
          ? "solid"
          : our_probability >= 0.1
            ? "average"
            : "long_shot";

  return { score, our_probability, matchup_rating, goal_line_rating, tier };
}

/** Blend research model with live market odds for display + ranking. */
export function blendModelWithMarket(args: {
  modelProbability: number;
  modelScore: number;
  marketProbability: number | null;
  marketAmerican: number | null;
}): { our_probability: number; score: number } {
  const market = args.marketProbability;
  if (market == null || market <= 0 || !args.marketAmerican) {
    return {
      our_probability: args.modelProbability,
      score: args.modelScore,
    };
  }
  // Market is the best public anytime-TD signal when present.
  const our_probability = Math.max(
    0.035,
    Math.min(0.5, args.modelProbability * 0.35 + market * 0.65),
  );
  const score = market * 10_000 + args.modelScore;
  return { our_probability, score };
}
