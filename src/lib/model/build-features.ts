import type { InjuryStatus, PlayerPosition, ResearchGameLog, ResearchHistory, ResearchJson, TrendDirection } from "@/lib/types";
import type { ProviderGame, WeatherReport } from "@/lib/providers/types";
import type { PlayerWeekFeatures } from "@/lib/model/features";
import { blendSeasonRates } from "@/lib/model/early-season";
import { recencyWeights, teamImpliedPoints, weightedAverage } from "@/lib/model/math";
import {
  buildLivePlayerHistoryFromContext,
  type HistoryContext,
} from "@/lib/providers/sleeper/research";
import {
  parseSleeperExternalId,
  rzTouchesFromStat,
  touchdownsFromStat,
  type SleeperWeekStat,
} from "@/lib/providers/sleeper/client";
import type { TeamDefenseProfile } from "@/lib/providers/team-defense/from-sleeper";

function trendFromRates(recent: number, baseline: number): TrendDirection {
  if (recent > baseline * 1.12 + 0.15) return "up";
  if (recent < baseline * 0.88 - 0.15) return "down";
  return "stable";
}

function avgFromLogs(
  logs: ResearchGameLog[],
  pick: (g: ResearchGameLog) => number,
): number | null {
  if (!logs.length) return null;
  const weights = recencyWeights(logs.length);
  return weightedAverage(
    logs.map((g, i) => ({ value: pick(g), weight: weights[i]! })),
  );
}

function seasonRateFromStats(
  stats: SleeperWeekStat[],
  pick: (s: SleeperWeekStat) => number,
): number | null {
  const played = stats.filter((s) => Number(s.gp ?? 0) > 0 || pick(s) > 0);
  if (!played.length) return null;
  return played.reduce((sum, s) => sum + pick(s), 0) / played.length;
}

export type FeatureBuildContext = {
  season: number;
  week: number;
  historyCtx: HistoryContext;
  priorSeasonStats: Map<string, SleeperWeekStat[]>;
  currentSeasonStats: Map<string, SleeperWeekStat[]>;
  defense: Map<string, TeamDefenseProfile>;
  defenseLabel: string;
  rushTdRanks: Map<string, number>;
  recTdRanks: Map<string, number>;
  depthBySleeperId: Map<string, number>;
  teammateOutByTeam: Map<string, string[]>;
  projections: Map<string, number>;
};

export function collectPlayerSeasonStats(
  ctx: HistoryContext,
  sleeperPlayerId: string,
  season: number,
): SleeperWeekStat[] {
  const out: SleeperWeekStat[] = [];
  for (const row of ctx.weeksToScan) {
    if (row.season !== season) continue;
    const stat = ctx.weekStats.get(`${row.season}-${row.week}`)?.get(sleeperPlayerId);
    if (stat) out.push(stat);
  }
  return out;
}

export function buildPlayerWeekFeatures(args: {
  externalPlayerId: string;
  playerName: string;
  team: string;
  position: PlayerPosition;
  opponent: string;
  game: ProviderGame;
  weather: WeatherReport;
  injuryStatus: InjuryStatus;
  injuryDetail: string | null;
  ctx: FeatureBuildContext;
}): PlayerWeekFeatures {
  const sleeperId = parseSleeperExternalId(args.externalPlayerId) ?? "";
  const history = buildLivePlayerHistoryFromContext({
    sleeperPlayerId: sleeperId,
    team: args.team,
    opponent: args.opponent,
    ctx: args.ctx.historyCtx,
  });

  const priorStats = args.ctx.priorSeasonStats.get(sleeperId) ?? [];
  const currentStats = args.ctx.currentSeasonStats.get(sleeperId) ?? [];

  const priorRz = seasonRateFromStats(priorStats, rzTouchesFromStat);
  const currentRz = avgFromLogs(history.last_5, (g) => g.rz_touches);
  const rzBlend = blendSeasonRates({
    week: args.ctx.week,
    prior: priorRz,
    current: currentRz,
  });

  const priorGl = seasonRateFromStats(priorStats, (s) =>
    Math.max(0, Number(s.rush_rz_att ?? 0) * 0.45),
  );
  const currentGl = avgFromLogs(history.last_5, (g) => g.goal_line_chances);
  const glBlend = blendSeasonRates({
    week: args.ctx.week,
    prior: priorGl,
    current: currentGl,
  });

  const priorCarries = seasonRateFromStats(priorStats, (s) => Number(s.rush_att ?? 0));
  const currentCarries = seasonRateFromStats(currentStats, (s) => Number(s.rush_att ?? 0));
  const carryBlend = blendSeasonRates({
    week: args.ctx.week,
    prior: priorCarries,
    current: currentCarries ?? avgFromLogs(history.last_5, () => priorCarries ?? 0),
  });

  const priorTargets = seasonRateFromStats(priorStats, (s) => Number(s.targets ?? 0));
  const currentTargets = seasonRateFromStats(currentStats, (s) => Number(s.targets ?? 0));
  const targetBlend = blendSeasonRates({
    week: args.ctx.week,
    prior: priorTargets,
    current: currentTargets,
  });

  const priorSnap = seasonRateFromStats(priorStats, (s) => {
    const off = Number(s.off_snp ?? 0);
    const tm = Number(s.tm_off_snp ?? 0);
    return tm > 0 ? off / tm : 0;
  });
  const currentSnap = seasonRateFromStats(currentStats, (s) => {
    const off = Number(s.off_snp ?? 0);
    const tm = Number(s.tm_off_snp ?? 0);
    return tm > 0 ? off / tm : 0;
  });
  const snapBlend = blendSeasonRates({
    week: args.ctx.week,
    prior: priorSnap,
    current: currentSnap,
  });

  const tdsLast5 = history.last_5.reduce((s, g) => s + g.touchdowns, 0);
  const tdsLast3 = history.last_5.slice(0, 3).reduce((s, g) => s + g.touchdowns, 0);

  const recentRz = avgFromLogs(history.last_5.slice(0, 3), (g) => g.rz_touches) ?? 0;
  const baseRz = rzBlend.value ?? 0;
  const recentTouchTrend = trendFromRates(recentRz + tdsLast3, baseRz + tdsLast5 / 5);

  const def = args.ctx.defense.get(args.opponent);
  const teamIsHome = args.game.home_team === args.team;
  const implied = teamImpliedPoints({
    total: args.game.total,
    spread: args.game.spread,
    teamIsHome,
  });

  const depthOrder = args.ctx.depthBySleeperId.get(sleeperId) ?? null;
  const teammatesOut = args.ctx.teammateOutByTeam.get(args.team) ?? [];

  const rzPerGame = rzBlend.value;
  const glPerGame = glBlend.value ?? 0;
  const carriesPerGame = carryBlend.value;
  const targetsPerGame = targetBlend.value;
  const snapRate = snapBlend.value;

  // Rough team-share proxies from depth + usage (improved when SportsDataIO RZ available)
  // QBs share the rushing formula — their goal-line value is carries, not targets.
  const isRusher = args.position === "RB" || args.position === "QB";
  const inside5Share = isRusher
    ? Math.min(0.85, Math.max(0.05, (glPerGame / 2.2) * (depthOrder === 1 ? 1.15 : 0.7)))
    : Math.min(0.55, Math.max(0.02, (rzPerGame ?? 0) / 8));

  const completenessFlags = [
    history.last_5.length > 0,
    rzPerGame != null,
    snapRate != null,
    def != null,
    args.game.total != null,
    implied != null,
  ];
  const dataCompleteness =
    completenessFlags.filter(Boolean).length / completenessFlags.length;
  const limitedData = dataCompleteness < 0.55;

  const featureNotes: string[] = [];
  if (args.ctx.week <= 5) {
    featureNotes.push(rzBlend.label);
    featureNotes.push(args.ctx.defenseLabel);
  }
  if (limitedData) featureNotes.push("Limited Data");

  const posRank =
    args.position === "RB"
      ? args.ctx.rushTdRanks.get(args.opponent) ?? null
      : args.ctx.recTdRanks.get(args.opponent) ?? null;

  return {
    season: args.ctx.season,
    week: args.ctx.week,
    playerId: "",
    externalPlayerId: args.externalPlayerId,
    playerName: args.playerName,
    team: args.team,
    opponent: args.opponent,
    position: args.position,
    gameId: args.game.external_game_id,
    kickoffAt: args.game.kickoff_at,
    teamIsHome,

    marketConsensusProbability: null,
    bestAnytimeTdOdds: null,
    consensusAnytimeTdOdds: null,
    marketBooks: 0,

    snapRate,
    carriesPerGame,
    targetsPerGame,
    touchShare:
      args.position === "RB"
        ? Math.min(0.75, Math.max(0.05, (carriesPerGame ?? 0) / 22))
        : null,
    targetShare:
      args.position === "RB"
        ? Math.min(0.2, Math.max(0.02, (targetsPerGame ?? 0) / 35))
        : Math.min(0.4, Math.max(0.04, (targetsPerGame ?? 0) / 28)),

    redZoneTouchesPerGame: rzPerGame,
    redZoneCarriesPerGame:
      args.position === "RB" ? Math.max(0, (rzPerGame ?? 0) * 0.7) : null,
    redZoneTargetsPerGame:
      args.position === "RB"
        ? Math.max(0, (rzPerGame ?? 0) * 0.3)
        : rzPerGame,
    inside10TouchesPerGame: glPerGame * 1.35,
    inside5TouchesPerGame: glPerGame,
    inside5TeamShare: inside5Share,
    inside10TeamShare: Math.min(0.9, inside5Share * 1.1),

    recentSnapTrend: trendFromRates(snapRate ?? 0, priorSnap ?? snapRate ?? 0),
    recentTouchTrend,
    recentTargetTrend: trendFromRates(targetsPerGame ?? 0, priorTargets ?? 0),
    recentRedZoneTrend: trendFromRates(recentRz, baseRz),

    touchdownsLast3: tdsLast3,
    touchdownsLast5: tdsLast5,
    scoringSampleGames: history.scoring_sample?.games ?? history.last_5.length,
    touchdownsInSample: history.scoring_sample?.touchdowns ?? tdsLast5,

    opponentDataLabel: args.ctx.defenseLabel,
    opponentRzTdAllowedRate: def?.rzTdAllowedRate ?? null,
    opponentRushTdAllowedRate: def?.rushTdAllowedRate ?? null,
    opponentRecTdAllowedRate: def?.recTdAllowedRate ?? null,
    opponentPositionTdRank: posRank,
    opponentTdAllowedSampleGames: def?.games ?? 0,

    spread: args.game.spread,
    gameTotal: args.game.total,
    teamImpliedPoints: implied,

    temperatureF: args.weather.temperature_f,
    windMph: args.weather.wind_mph,
    precipProbability: args.weather.precip_chance,
    indoor: args.weather.is_dome,
    weatherSeverity: args.weather.severity,

    playerInjuryStatus: args.injuryStatus,
    depthOrder,
    teammateInjuryContext: teammatesOut,
    opposingDefenseInjuryContext: [],

    externalProjectionScore:
      args.ctx.projections.get(args.externalPlayerId) ?? null,

    dataCompleteness: Number(dataCompleteness.toFixed(3)),
    limitedData,
    featureNotes,
  };
}

export function featuresToResearchJson(args: {
  features: PlayerWeekFeatures;
  history: ResearchHistory;
  model: import("@/lib/model/features").TdPoolModelOutput;
  analysis: {
    overview: string;
    whyWeLike: string[];
    concerns: string[];
    verdict: string;
  };
  injuryDetail: string | null;
}): ResearchJson {
  const { features: f, history, model, analysis } = args;
  const glRankLabel =
    model.goalLinePercentile >= 0
      ? `${Math.round(model.goalLinePercentile * 100)}th percentile`
      : "—";

  return {
    why_we_like: analysis.whyWeLike,
    concerns: analysis.concerns,
    verdict: analysis.verdict,
    red_zone: {
      carries: Math.round(f.redZoneCarriesPerGame ?? 0),
      targets: Math.round(f.redZoneTargetsPerGame ?? 0),
      touches_per_game: Number((f.redZoneTouchesPerGame ?? 0).toFixed(1)),
      share: f.inside10TeamShare ?? 0,
    },
    goal_line: {
      carries_inside_10: Math.round(f.inside10TouchesPerGame ?? 0),
      carries_inside_5: Math.round(f.inside5TouchesPerGame ?? 0),
      team_share: f.inside5TeamShare ?? 0,
      opportunities: Math.round((f.inside5TouchesPerGame ?? 0) * 5),
    },
    matchup: {
      opponent: f.opponent,
      tds_allowed: Math.round(
        ((f.opponentRushTdAllowedRate ?? 0) + (f.opponentRecTdAllowedRate ?? 0)) *
          Math.max(1, f.opponentTdAllowedSampleGames),
      ),
      red_zone_td_rate: f.opponentRzTdAllowedRate ?? 0,
      rushing_tds_allowed: Math.round(
        (f.opponentRushTdAllowedRate ?? 0) *
          Math.max(1, f.opponentTdAllowedSampleGames),
      ),
      receiving_tds_allowed: Math.round(
        (f.opponentRecTdAllowedRate ?? 0) *
          Math.max(1, f.opponentTdAllowedSampleGames),
      ),
      position_rank_allowed: f.opponentPositionTdRank ?? 16,
      notes: `${f.opponentDataLabel}. Goal-line ${glRankLabel}. ${analysis.overview}`,
    },
    usage: {
      snap_share: f.snapRate ?? 0,
      carry_share: f.touchShare,
      target_share: f.targetShare,
      targets_per_game: f.targetsPerGame,
      end_zone_targets: Math.round(f.redZoneTargetsPerGame ?? 0),
      recent_trend: f.recentTouchTrend,
      last_games_summary: history.last_5_summary,
    },
    history,
    game_environment: {
      spread: f.spread,
      total: f.gameTotal,
      team_implied_points: f.teamImpliedPoints,
      weather: {
        temperature_f: f.temperatureF,
        wind_mph: f.windMph,
        precip_chance: f.precipProbability,
        severity: f.weatherSeverity,
        notes: f.indoor
          ? "Indoor"
          : `Wind ${f.windMph ?? "—"} mph · precip ${f.precipProbability ?? "—"}%`,
      },
    },
    injuries: {
      player_status: f.playerInjuryStatus,
      player_detail: args.injuryDetail,
      relevant: f.teammateInjuryContext.map((note) => ({
        name: "Teammate",
        status: "out" as InjuryStatus,
        note,
      })),
    },
    market: {
      consensus_american: f.consensusAnytimeTdOdds ?? 0,
      consensus_implied: f.marketConsensusProbability ?? 0,
      books: [],
    },
  };
}

// re-export helper used by board builder
export { touchdownsFromStat };
