import type { InjuryStatus, PlayerPosition, TrendDirection } from "@/lib/types";

/** Normalized weekly feature vector consumed by the TD Pool model. */
export type PlayerWeekFeatures = {
  season: number;
  week: number;
  playerId: string;
  externalPlayerId: string;
  playerName: string;
  team: string;
  opponent: string;
  position: PlayerPosition;
  gameId: string;
  kickoffAt: string;
  teamIsHome: boolean;

  // market
  marketConsensusProbability: number | null;
  bestAnytimeTdOdds: number | null;
  consensusAnytimeTdOdds: number | null;
  marketBooks: number;

  // usage (blended early-season aware)
  snapRate: number | null;
  carriesPerGame: number | null;
  targetsPerGame: number | null;
  touchShare: number | null;
  targetShare: number | null;

  // red zone / goal line
  redZoneTouchesPerGame: number | null;
  redZoneCarriesPerGame: number | null;
  redZoneTargetsPerGame: number | null;
  inside10TouchesPerGame: number | null;
  inside5TouchesPerGame: number | null;
  inside5TeamShare: number | null;
  inside10TeamShare: number | null;

  // trends
  recentSnapTrend: TrendDirection;
  recentTouchTrend: TrendDirection;
  recentTargetTrend: TrendDirection;
  recentRedZoneTrend: TrendDirection;

  // scoring history
  touchdownsLast3: number;
  touchdownsLast5: number;
  /** Rolling season-length scoring sample, shrunk by size in the rate model. */
  scoringSampleGames: number;
  touchdownsInSample: number;

  // opponent (may be prior-season labeled)
  opponentDataLabel: string;
  opponentRzTdAllowedRate: number | null;
  opponentRushTdAllowedRate: number | null;
  opponentRecTdAllowedRate: number | null;
  opponentPositionTdRank: number | null;
  opponentTdAllowedSampleGames: number;

  // game environment
  spread: number | null;
  gameTotal: number | null;
  teamImpliedPoints: number | null;

  // weather
  temperatureF: number | null;
  windMph: number | null;
  precipProbability: number | null;
  indoor: boolean;
  weatherSeverity: "none" | "mild" | "moderate" | "severe";

  // injuries / depth
  playerInjuryStatus: InjuryStatus;
  depthOrder: number | null;
  teammateInjuryContext: string[];
  opposingDefenseInjuryContext: string[];

  // external projection (optional)
  externalProjectionScore: number | null;

  // completeness
  dataCompleteness: number;
  limitedData: boolean;
  featureNotes: string[];
};

export type FactorContribution = {
  key: string;
  label: string;
  /** Probability points added/subtracted (e.g. +0.041). */
  delta: number;
  /** Normalized 0–1 factor score used to derive delta. */
  factorScore: number;
  detail: string;
};

export type TdPoolModelOutput = {
  tdPoolProbability: number;
  marketProbability: number | null;
  goalLineScore: number;
  goalLinePercentile: number;
  goalLineStars: number;
  matchupScore: number;
  matchupPercentile: number;
  matchupStars: number;
  recentUsageScore: number;
  injuryAdjustment: number;
  weatherAdjustment: number;
  scoringEnvironmentScore: number;
  projectionScore: number | null;
  contributions: FactorContribution[];
  dataCompleteness: number;
  limitedData: boolean;
  modelVersion: string;
};
