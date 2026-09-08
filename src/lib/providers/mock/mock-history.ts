import type {
  PlayerPosition,
  ResearchGameLog,
  ResearchHistory,
  TrendDirection,
} from "@/lib/types";

const NFL_TEAMS = [
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
  "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
  "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
  "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
] as const;

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function seededUnit(seed: string, salt: string): number {
  return (hashString(`${seed}:${salt}`) % 10_000) / 10_000;
}

function pickOpponents(team: string, seed: string, count: number): string[] {
  const pool = NFL_TEAMS.filter((t) => t !== team);
  const start = hashString(`${seed}:opp-rot`) % pool.length;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(pool[(start + i * 7) % pool.length]!);
  }
  return out;
}

function buildGameLog(args: {
  seed: string;
  week: number;
  opponent: string;
  position: PlayerPosition;
  index: number;
  /** Bias TD rate slightly higher for elite names / good recent form. */
  tdBias?: number;
}): ResearchGameLog {
  const { seed, week, opponent, position, index, tdBias = 0 } = args;
  const u = seededUnit(seed, `g-${week}-${opponent}-${index}`);
  const home = seededUnit(seed, `home-${week}-${index}`) > 0.45;
  const won = seededUnit(seed, `wl-${week}-${index}`) > 0.42;

  const isRunner = position === "RB" || position === "QB";
  const tdRoll = u + tdBias;
  let touchdowns = 0;
  if (tdRoll > 0.72) touchdowns = 2;
  else if (tdRoll > 0.38) touchdowns = 1;

  const rzBase = isRunner ? 2.2 : 1.4;
  const rz_touches = Math.max(
    0,
    Math.round(rzBase + seededUnit(seed, `rz-${week}-${index}`) * 4 - 1),
  );
  const goal_line_chances = Math.max(
    0,
    Math.round(
      (isRunner ? 0.8 : 0.4) +
        seededUnit(seed, `gl-${week}-${index}`) * (isRunner ? 3 : 2),
    ),
  );

  const carries = isRunner
    ? Math.round(8 + seededUnit(seed, `car-${week}-${index}`) * 12)
    : Math.round(seededUnit(seed, `car-${week}-${index}`) * 2);
  const receptions = isRunner
    ? Math.round(seededUnit(seed, `rec-${week}-${index}`) * 4)
    : Math.round(3 + seededUnit(seed, `rec-${week}-${index}`) * 6);

  return {
    week,
    opponent,
    home,
    touchdowns,
    rz_touches,
    carries,
    rush_yards: Math.round(carries * (3.2 + seededUnit(seed, `ry-${week}`) * 2)),
    receptions,
    receiving_yards: Math.round(
      receptions * (7 + seededUnit(seed, `recy-${week}`) * 6),
    ),
    goal_line_chances,
  };
}

function summarizeLast5(games: ResearchGameLog[], trend: TrendDirection): string {
  if (games.length === 0) return "No recent games logged.";
  const tdGames = games.filter((g) => g.touchdowns > 0).length;
  const tdTotal = games.reduce((s, g) => s + g.touchdowns, 0);
  const rzAvg =
    games.reduce((s, g) => s + g.rz_touches, 0) / Math.max(1, games.length);
  const trendBit =
    trend === "up"
      ? "Usage ↑"
      : trend === "down"
        ? "Usage ↓"
        : "Usage →";
  return `${tdGames}/${games.length} games with a TD · ${tdTotal} TDs · ${rzAvg.toFixed(1)} RZ touches/g · ${trendBit}`;
}

function summarizeVsOpp(games: ResearchGameLog[], opponent: string): string {
  if (games.length === 0) {
    return `No recent meetings vs ${opponent} in sample.`;
  }
  if (games.length === 1) {
    const g = games[0]!;
    return `Limited sample (1 game): ${g.touchdowns} TD · ${g.rz_touches} RZ touches.`;
  }
  const tdGames = games.filter((g) => g.touchdowns > 0).length;
  const tdTotal = games.reduce((s, g) => s + g.touchdowns, 0);
  const rzAvg =
    games.reduce((s, g) => s + g.rz_touches, 0) / games.length;
  return `${tdGames}/${games.length} vs ${opponent} with a TD · ${tdTotal} TDs · ${rzAvg.toFixed(1)} RZ/g`;
}

/**
 * Deterministic mock history for Phase 1–2.
 * Replace with live game logs when NFL provider supplies them.
 */
export function buildPlayerHistory(args: {
  externalPlayerId: string;
  team: string;
  position: PlayerPosition;
  opponent: string;
  currentWeek?: number;
  recentTrend?: TrendDirection;
}): ResearchHistory {
  const {
    externalPlayerId,
    team,
    position,
    opponent,
    currentWeek = 4,
    recentTrend = "stable",
  } = args;

  const tdBias =
    seededUnit(externalPlayerId, "elite") > 0.55
      ? 0.12
      : seededUnit(externalPlayerId, "elite") < 0.25
        ? -0.08
        : 0;

  const recentOpps = pickOpponents(team, externalPlayerId, 5).map((o, i) =>
    o === opponent
      ? NFL_TEAMS[(hashString(externalPlayerId) + i) % NFL_TEAMS.length]! ===
        team
        ? "DAL"
        : NFL_TEAMS[(hashString(externalPlayerId) + i + 3) % NFL_TEAMS.length]!
      : o,
  );

  const last_5: ResearchGameLog[] = recentOpps.map((opp, i) =>
    buildGameLog({
      seed: externalPlayerId,
      week: currentWeek - 1 - i,
      opponent: opp === team ? "NYG" : opp,
      position,
      index: i,
      tdBias,
    }),
  );

  // 1–3 prior meetings vs this week's opponent
  const vsCount =
    1 + Math.floor(seededUnit(externalPlayerId, `vs-n-${opponent}`) * 3);
  const vs_opponent: ResearchGameLog[] = Array.from({ length: vsCount }, (_, i) =>
    buildGameLog({
      seed: externalPlayerId,
      week: Math.max(1, currentWeek - 4 - i * 3),
      opponent,
      position,
      index: 100 + i,
      tdBias: tdBias + 0.05,
    }),
  );

  return {
    last_5,
    vs_opponent,
    last_5_summary: summarizeLast5(last_5, recentTrend),
    vs_opponent_summary: summarizeVsOpp(vs_opponent, opponent),
    recent_trend: recentTrend,
  };
}
