import {
  americanToDecimal,
  decimalToAmerican,
  impliedProbabilityFromAmerican,
} from "@/lib/utils/odds";
import type { ConsensusOdds, OddsQuote, ProviderSportsbook } from "@/lib/providers/types";

const BOOKS: ProviderSportsbook[] = ["FanDuel", "DraftKings", "Bet365"];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** Position-aware synthetic anytime TD implied prob when live books are unavailable. */
function syntheticImplied(name: string, position: string): number {
  const roll = (hashName(name) % 1000) / 1000;
  const base =
    position === "RB" ? 0.42 : position === "WR" ? 0.28 : position === "TE" ? 0.22 : 0.18;
  return Math.max(0.08, Math.min(0.58, base + (roll - 0.5) * 0.12));
}

/**
 * Build roster-matched anytime TD quotes when The Odds API cannot supply player props.
 * Uses sleeper external IDs so applyOddsRefresh can attach to the live board.
 */
export function buildSyntheticAnytimeTdConsensus(args: {
  roster: Array<{
    external_player_id: string;
    name: string;
    team: string;
    position?: string;
  }>;
  games: Array<{
    external_game_id: string;
    home_team: string;
    away_team: string;
  }>;
}): ConsensusOdds[] {
  const fetchedAt = new Date().toISOString();
  const gameByTeam = new Map<string, string>();
  for (const g of args.games) {
    gameByTeam.set(g.home_team, g.external_game_id);
    gameByTeam.set(g.away_team, g.external_game_id);
  }

  const out: ConsensusOdds[] = [];
  for (const player of args.roster) {
    const gameId = gameByTeam.get(player.team);
    if (!gameId) continue;
    const implied = syntheticImplied(player.name, player.position ?? "WR");
    const decimal = 1 / implied;
    const american = decimalToAmerican(decimal);
    const books: OddsQuote[] = BOOKS.map((sportsbook, i) => {
      const jitter = american + (i - 1) * 8;
      const safe = jitter === 0 ? -100 : jitter;
      return {
        external_player_id: player.external_player_id,
        external_game_id: gameId,
        sportsbook,
        market: "anytime_td",
        american_odds: safe,
        decimal_odds: Number(americanToDecimal(safe).toFixed(4)),
        implied_probability: Number(impliedProbabilityFromAmerican(safe).toFixed(4)),
        fetched_at: fetchedAt,
      };
    });
    out.push({
      external_player_id: player.external_player_id,
      external_game_id: gameId,
      american_odds: american === 0 ? -100 : american,
      decimal_odds: Number(decimal.toFixed(4)),
      implied_probability: Number(implied.toFixed(4)),
      books,
      fetched_at: fetchedAt,
    });
  }
  return out.sort((a, b) => b.implied_probability - a.implied_probability);
}
