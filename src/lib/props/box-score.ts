import { normalizePlayerName } from "@/lib/providers/the-odds-api/maps";
import {
  mapTeamAbbr,
  type EspnSummary,
} from "@/lib/providers/espn/espn-nfl-provider";

export type PlayerStatLine = {
  name: string;
  team: string;
  passAtt: number;
  passCmp: number;
  passYds: number;
  passTds: number;
  passInt: number;
  rushAtt: number;
  rushYds: number;
  rushTds: number;
  rec: number;
  recYds: number;
  recTds: number;
  /** Kick and punt return touchdowns. */
  retTds: number;
  /** Fumble and interception return touchdowns. */
  defTds: number;
  fgMade: number;
  kickPts: number;
};

export type GameBoxScore = {
  home: { abbr: string; score: number };
  away: { abbr: string; score: number };
  /** Keyed by normalized player name. */
  players: Map<string, PlayerStatLine>;
  firstTouchdown: { scorer: string; team: string; defensive: boolean } | null;
  /** Defense and special-teams touchdowns, by team abbreviation. */
  dstTouchdowns: Record<string, number>;
  /** Normalized names the pregame injury report listed as out. */
  ruledOut: Set<string>;
};

export function emptyStatLine(name = "", team = ""): PlayerStatLine {
  return {
    name,
    team,
    passAtt: 0,
    passCmp: 0,
    passYds: 0,
    passTds: 0,
    passInt: 0,
    rushAtt: 0,
    rushYds: 0,
    rushTds: 0,
    rec: 0,
    recYds: 0,
    recTds: 0,
    retTds: 0,
    defTds: 0,
    fgMade: 0,
    kickPts: 0,
  };
}

function num(raw: string | number | undefined | null): number {
  const n = Number.parseFloat(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** "23/33" → made 23 of 33. */
function madeOf(raw: string | undefined): { made: number; att: number } {
  const [made, att] = String(raw ?? "").split("/");
  return { made: num(made), att: num(att) };
}

/** ESPN scoring text leads with the scorer: "Kyren Williams 5 Yd Rush (kick)". */
export function scorerFromPlayText(text: string): string | null {
  const name = text.split(/\s-?\d/)[0]?.trim();
  return name || null;
}

/** Return and turnover touchdowns count for a team's D/ST, not its offense. */
function isDefensiveTouchdown(typeText: string): boolean {
  const t = typeText.toLowerCase();
  if (!t.includes("touchdown")) return false;
  if (/rushing|passing|receiving/.test(t)) return false;
  return /return|blocked|interception|fumble|defensive/.test(t);
}

export function parseEspnBoxScore(summary: EspnSummary): GameBoxScore | null {
  const competitors = summary.header?.competitions?.[0]?.competitors ?? [];
  const homeTeam = competitors.find((c) => c.homeAway === "home");
  const awayTeam = competitors.find((c) => c.homeAway === "away");
  if (!homeTeam?.team?.abbreviation || !awayTeam?.team?.abbreviation) {
    return null;
  }

  const players = new Map<string, PlayerStatLine>();
  for (const teamBlock of summary.boxscore?.players ?? []) {
    const team = mapTeamAbbr(teamBlock.team?.abbreviation);
    for (const category of teamBlock.statistics ?? []) {
      const keys = category.keys ?? [];
      for (const row of category.athletes ?? []) {
        const name = row.athlete?.displayName ?? row.athlete?.fullName;
        if (!name) continue;
        const norm = normalizePlayerName(name);
        const line = players.get(norm) ?? emptyStatLine(name, team);
        const stat = (key: string) => {
          const i = keys.indexOf(key);
          return i >= 0 ? row.stats?.[i] : undefined;
        };

        switch (category.name) {
          case "passing": {
            const split = madeOf(stat("completions/passingAttempts"));
            line.passCmp += split.made;
            line.passAtt += split.att;
            line.passYds += num(stat("passingYards"));
            line.passTds += num(stat("passingTouchdowns"));
            line.passInt += num(stat("interceptions"));
            break;
          }
          case "rushing":
            line.rushAtt += num(stat("rushingAttempts"));
            line.rushYds += num(stat("rushingYards"));
            line.rushTds += num(stat("rushingTouchdowns"));
            break;
          case "receiving":
            line.rec += num(stat("receptions"));
            line.recYds += num(stat("receivingYards"));
            line.recTds += num(stat("receivingTouchdowns"));
            break;
          case "kickReturns":
            line.retTds += num(stat("kickReturnTouchdowns"));
            break;
          case "puntReturns":
            line.retTds += num(stat("puntReturnTouchdowns"));
            break;
          // Both tables can carry the same interception-return score.
          case "defensive":
            line.defTds = Math.max(line.defTds, num(stat("defensiveTouchdowns")));
            break;
          case "interceptions":
            line.defTds = Math.max(
              line.defTds,
              num(stat("interceptionTouchdowns")),
            );
            break;
          case "kicking":
            line.fgMade += madeOf(stat("fieldGoalsMade/fieldGoalAttempts")).made;
            line.kickPts += num(stat("totalKickingPoints"));
            break;
        }
        players.set(norm, line);
      }
    }
  }

  let firstTouchdown: GameBoxScore["firstTouchdown"] = null;
  const dstTouchdowns: Record<string, number> = {};
  for (const play of summary.scoringPlays ?? []) {
    const typeText = play.type?.text ?? "";
    const touchdown =
      /touchdown/i.test(typeText) || play.scoringType?.name === "touchdown";
    if (!touchdown) continue;
    const team = mapTeamAbbr(play.team?.abbreviation);
    const defensive = isDefensiveTouchdown(typeText);
    if (defensive && team) dstTouchdowns[team] = (dstTouchdowns[team] ?? 0) + 1;
    if (!firstTouchdown) {
      const scorer = scorerFromPlayText(play.text ?? "");
      if (scorer) firstTouchdown = { scorer, team, defensive };
    }
  }

  const ruledOut = new Set<string>();
  for (const teamBlock of summary.injuries ?? []) {
    for (const entry of teamBlock.injuries ?? []) {
      const status = (entry.status ?? "").toLowerCase();
      const name = entry.athlete?.displayName;
      if (name && (status === "out" || status.includes("injured reserve"))) {
        ruledOut.add(normalizePlayerName(name));
      }
    }
  }

  return {
    home: {
      abbr: mapTeamAbbr(homeTeam.team.abbreviation),
      score: num(homeTeam.score),
    },
    away: {
      abbr: mapTeamAbbr(awayTeam.team.abbreviation),
      score: num(awayTeam.score),
    },
    players,
    firstTouchdown,
    dstTouchdowns,
    ruledOut,
  };
}
