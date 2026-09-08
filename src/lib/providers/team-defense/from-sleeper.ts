/**
 * Build opponent TD-allowed profiles from Sleeper weekly player stats.
 * Used when SportsDataIO is not configured.
 */

import {
  getSleeperPlayersMap,
  getSleeperSchedule,
  getSleeperWeekStats,
  opponentFromSchedule,
  touchdownsFromStat,
  type SleeperWeekStat,
} from "@/lib/providers/sleeper/client";
import { mapWithConcurrency } from "@/lib/concurrency";

export type TeamDefenseProfile = {
  team: string;
  games: number;
  rushTdAllowed: number;
  recTdAllowed: number;
  /** Approx RZ TD rate proxy: (rush+rec TD) / games scaled. */
  rzTdAllowedRate: number;
  rushTdAllowedRate: number;
  recTdAllowedRate: number;
  seasonLabel: string;
};

function emptyProfile(team: string, seasonLabel: string): TeamDefenseProfile {
  return {
    team,
    games: 0,
    rushTdAllowed: 0,
    recTdAllowed: 0,
    rzTdAllowedRate: 0.35,
    rushTdAllowedRate: 0.2,
    recTdAllowedRate: 0.22,
    seasonLabel,
  };
}

async function accumulateSeason(
  season: number,
  maxWeek: number,
): Promise<Map<string, TeamDefenseProfile>> {
  const label = String(season);
  const schedule = await getSleeperSchedule(season);
  const players = await getSleeperPlayersMap();
  const profiles = new Map<string, TeamDefenseProfile>();

  const weeks = Array.from({ length: Math.max(0, maxWeek) }, (_, i) => i + 1);
  const statsByWeek = await mapWithConcurrency(weeks, 6, async (week) => ({
    week,
    stats: await getSleeperWeekStats(season, week),
  }));

  // Games played per team from schedule
  for (const g of schedule) {
    if (g.week < 1 || g.week > maxWeek) continue;
    if (g.status !== "complete" && g.status !== "final") {
      // Sleeper may use other statuses; still count if week <= maxWeek and we have stats
    }
    for (const team of [g.home, g.away]) {
      const p = profiles.get(team) ?? emptyProfile(team, label);
      p.games += 1;
      profiles.set(team, p);
    }
  }

  // Sleeper week stats often omit `opponent` / `team` — resolve via roster map + schedule.
  for (const { week, stats } of statsByWeek) {
    for (const [playerId, stat] of stats) {
      const rushTd = Number(stat.rush_td ?? 0);
      const recTd = Number(stat.rec_td ?? 0);
      if (rushTd <= 0 && recTd <= 0) continue;

      let opp = String(stat.opponent ?? "").trim();
      if (!opp) {
        const team =
          String(stat.team ?? "").trim() ||
          String(players.get(playerId)?.team ?? "").trim();
        if (!team) continue;
        opp = opponentFromSchedule(schedule, team, week)?.opponent ?? "";
      }
      if (!opp) continue;

      const p = profiles.get(opp) ?? emptyProfile(opp, label);
      p.rushTdAllowed += rushTd;
      p.recTdAllowed += recTd;
      profiles.set(opp, p);
    }
  }

  for (const p of profiles.values()) {
    const g = Math.max(1, p.games);
    p.rushTdAllowedRate = p.rushTdAllowed / g;
    p.recTdAllowedRate = p.recTdAllowed / g;
    p.rzTdAllowedRate = (p.rushTdAllowed + p.recTdAllowed) / g;
  }

  return profiles;
}

export async function loadDefenseProfiles(args: {
  season: number;
  week: number;
}): Promise<{
  profiles: Map<string, TeamDefenseProfile>;
  label: string;
}> {
  // Early season: prefer prior full season.
  if (args.week <= 2) {
    const prior = await accumulateSeason(args.season - 1, 18);
    return {
      profiles: prior,
      label: `${args.season - 1} opponent data`,
    };
  }

  const currentMax = Math.max(1, args.week - 1);
  const current = await accumulateSeason(args.season, currentMax);

  if (args.week <= 5) {
    const prior = await accumulateSeason(args.season - 1, 18);
    // Blend rates
    const blended = new Map<string, TeamDefenseProfile>();
    const teams = new Set([...current.keys(), ...prior.keys()]);
    const priorW = args.week === 3 ? 0.55 : args.week === 4 ? 0.4 : 0.25;
    const curW = 1 - priorW;
    for (const team of teams) {
      const c = current.get(team) ?? emptyProfile(team, String(args.season));
      const p = prior.get(team) ?? emptyProfile(team, String(args.season - 1));
      blended.set(team, {
        team,
        games: c.games + p.games,
        rushTdAllowed: c.rushTdAllowed + p.rushTdAllowed,
        recTdAllowed: c.recTdAllowed + p.recTdAllowed,
        rushTdAllowedRate:
          c.rushTdAllowedRate * curW + p.rushTdAllowedRate * priorW,
        recTdAllowedRate:
          c.recTdAllowedRate * curW + p.recTdAllowedRate * priorW,
        rzTdAllowedRate: c.rzTdAllowedRate * curW + p.rzTdAllowedRate * priorW,
        seasonLabel: `Blended ${args.season - 1}/${args.season}`,
      });
    }
    return {
      profiles: blended,
      label: `Blended ${args.season - 1}/${args.season} opponent data`,
    };
  }

  return {
    profiles: current,
    label: `${args.season} opponent data`,
  };
}

/** Rank teams 1 = stingiest (fewest TDs allowed) to 32 = softest, for a position path. */
export function rankTeamsByTdAllowed(
  profiles: Map<string, TeamDefenseProfile>,
  mode: "rush" | "rec",
): Map<string, number> {
  const rows = [...profiles.values()].map((p) => ({
    team: p.team,
    rate: mode === "rush" ? p.rushTdAllowedRate : p.recTdAllowedRate,
  }));
  rows.sort((a, b) => a.rate - b.rate);
  const ranks = new Map<string, number>();
  rows.forEach((row, i) => ranks.set(row.team, i + 1));
  return ranks;
}

export function touchdownsAllowedProxy(stat: SleeperWeekStat): number {
  return touchdownsFromStat(stat);
}
