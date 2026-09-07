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

function emptyHistory(): ResearchHistory {
  return {
    last_5: [],
    vs_opponent: [],
    last_5_summary: "No recent game logs yet.",
    vs_opponent_summary: "No prior meetings found.",
    recent_trend: "stable",
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
  const tds = logs.reduce((s, g) => s + g.touchdowns, 0);
  const rz = logs.reduce((s, g) => s + g.rz_touches, 0);
  return `Last ${logs.length}: ${tds} TD · ${rz} RZ touches · ${logs.filter((g) => g.result === "W").length}-${logs.filter((g) => g.result === "L").length}`;
}

function summarizeVs(logs: ResearchGameLog[], opponent: string): string {
  if (!logs.length) return `No recent games vs ${opponent}.`;
  const tds = logs.reduce((s, g) => s + g.touchdowns, 0);
  return `Vs ${opponent} (last ${logs.length}): ${tds} TD · avg RZ ${((logs.reduce((s, g) => s + g.rz_touches, 0) / logs.length) || 0).toFixed(1)}`;
}

function toLog(
  week: number,
  opponent: string,
  home: boolean,
  stat: SleeperWeekStat,
): ResearchGameLog {
  return {
    week,
    opponent,
    home,
    result: "T",
    touchdowns: touchdownsFromStat(stat),
    rz_touches: rzTouchesFromStat(stat),
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
};

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
    // Last ~8 completed weeks is enough for last-5 + vs-opp hits.
    for (let week = maxWeek; week >= Math.max(1, maxWeek - 7); week -= 1) {
      weeksToScan.push({ season, week });
    }
  }

  const weekStats = new Map<string, Map<string, SleeperWeekStat>>();
  await Promise.all(
    weeksToScan.map(async ({ season, week }) => {
      const key = `${season}-${week}`;
      weekStats.set(key, await getSleeperWeekStats(season, week));
    }),
  );

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

      const log = toLog(week, matchup.opponent, matchup.home, stat);
      if (last5.length < 5) last5.push(log);
      if (matchup.opponent === args.opponent && vsOpp.length < 5) {
        vsOpp.push(log);
      }
      if (last5.length >= 5 && vsOpp.length >= 3) break;
    }

    return {
      last_5: last5,
      vs_opponent: vsOpp,
      last_5_summary: summarizeLast5(last5),
      vs_opponent_summary: summarizeVs(vsOpp, args.opponent),
      recent_trend: trendFromLogs(last5),
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
      snap_share: 0,
      carry_share: args.position === "RB" ? 0.45 : 0,
      target_share:
        args.position === "WR" || args.position === "TE" ? 0.18 : 0.08,
      targets_per_game:
        args.position === "WR" || args.position === "TE" ? 6 : 2,
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
  const tds = hist?.last_5.reduce((s, g) => s + g.touchdowns, 0) ?? 0;
  const rz = hist?.last_5.reduce((s, g) => s + g.rz_touches, 0) ?? 0;
  const gl = hist?.last_5.reduce((s, g) => s + g.goal_line_chances, 0) ?? 0;
  const vs = hist?.vs_opponent.reduce((s, g) => s + g.touchdowns, 0) ?? 0;
  const carryShare = research.usage.carry_share ?? 0;
  const weatherBoost =
    research.game_environment.weather.severity !== "none"
      ? carryShare > 0
        ? 0.04
        : -0.03
      : 0;

  const raw =
    tds * 0.12 +
    rz * 0.025 +
    gl * 0.04 +
    vs * 0.08 +
    (research.game_environment.total ?? 44) / 200 +
    weatherBoost;

  // Cap realistic anytime (rush/rec) TD rates — QBs with one sneak shouldn't dominate.
  const positionCap =
    research.usage.carry_share && research.usage.carry_share > 0.2
      ? 0.42
      : research.usage.target_share && research.usage.target_share > 0
        ? 0.38
        : 0.22;

  const our_probability = Math.max(0.03, Math.min(positionCap, raw));
  const score = our_probability * 100;
  const matchup_rating = Math.max(
    1,
    Math.min(
      5,
      Math.round(2 + vs + (research.game_environment.total ?? 44) / 50),
    ),
  );
  const goal_line_rating = Math.max(
    1,
    Math.min(
      5,
      Math.round(
        1 + gl / 2 + (hist?.last_5.length ? rz / hist.last_5.length : 0),
      ),
    ),
  );
  const tier: TdTier =
    our_probability >= 0.28
      ? "elite"
      : our_probability >= 0.2
        ? "strong"
        : our_probability >= 0.12
          ? "solid"
          : our_probability >= 0.08
            ? "average"
            : "long_shot";

  return { score, our_probability, matchup_rating, goal_line_rating, tier };
}
