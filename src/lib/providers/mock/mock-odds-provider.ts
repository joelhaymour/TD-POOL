import {
  americanToDecimal,
  impliedProbabilityFromAmerican,
} from "@/lib/utils/odds";
import {
  MOCK_WEEK4_PLAYERS,
  TEAM_TO_GAME,
} from "@/lib/providers/mock/mock-nfl-provider";
import type {
  ConsensusOdds,
  OddsProvider,
  OddsQuote,
  ProviderSportsbook,
} from "@/lib/providers/types";

const SEASON = 2025;
const WEEK = 4;
const BOOKS: ProviderSportsbook[] = ["FanDuel", "DraftKings", "Bet365"];

/**
 * Baseline consensus American anytime TD odds by external player id.
 * Negative = favorite to score; positive = underdog.
 */
const CONSENSUS_AMERICAN: Record<string, number> = {
  "p-barkley": -145,
  "p-henry": -130,
  "p-mccaffrey": -140,
  "p-gibbs": -115,
  "p-taylor": -110,
  "p-jacobs": -105,
  "p-chase": +105,
  "p-jefferson": +110,
  "p-lamb": +115,
  "p-stbrown": +120,
  "p-hurts": +125,
  "p-allen": +135,
  "p-kyren": -102,
  "p-conner": +100,
  "p-walker": +105,
  "p-irving": +110,
  "p-cook": +120,
  "p-achane": +125,
  "p-montgomery": +130,
  "p-pacheco": +135,
  "p-dobbins": +140,
  "p-stevenson": +150,
  "p-aaronjones": +145,
  "p-williams-j": +160,
  "p-mixon": +155,
  "p-brown": +145,
  "p-evans": +150,
  "p-hill": +155,
  "p-waddle": +175,
  "p-metcalf": +165,
  "p-mhj": +170,
  "p-collins": +160,
  "p-higgins": +180,
  "p-smith": +185,
  "p-godwin": +190,
  "p-flowers": +175,
  "p-sutton": +185,
  "p-doubs": +210,
  "p-pittman": +200,
  "p-johnston": +220,
  "p-worthy": +200,
  "p-aivuk": +195,
  "p-puka": +165,
  "p-kupp": +190,
  "p-kelce": +155,
  "p-andrews": +165,
  "p-laporta": +170,
  "p-kittle": +160,
  "p-mahomes": +280,
  "p-herbert": +320,
  "p-prescott": +350,
  "p-stroud": +380,
  "p-nix": +340,
  "p-maye": +400,
};

function bookOffset(book: ProviderSportsbook, index: number): number {
  // Deterministic slight variance per sportsbook.
  const offsets: Record<string, number> = {
    FanDuel: -5,
    DraftKings: 5,
    Bet365: 0,
  };
  return (offsets[book] ?? 0) + ((index % 3) - 1) * 5;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeQuote(
  externalPlayerId: string,
  externalGameId: string,
  sportsbook: ProviderSportsbook,
  american: number,
  fetchedAt: string,
): OddsQuote {
  const decimal = Number(americanToDecimal(american).toFixed(4));
  return {
    external_player_id: externalPlayerId,
    external_game_id: externalGameId,
    sportsbook,
    market: "anytime_td",
    american_odds: american,
    decimal_odds: decimal,
    implied_probability: Number(
      impliedProbabilityFromAmerican(american).toFixed(4),
    ),
    fetched_at: fetchedAt,
  };
}

function eligiblePlayers() {
  return MOCK_WEEK4_PLAYERS.filter(
    (p) => p.active && TEAM_TO_GAME[p.team] && CONSENSUS_AMERICAN[p.external_player_id],
  );
}

export class MockOddsProvider implements OddsProvider {
  async getAnytimeTdOdds(
    season: number,
    week: number,
    sportsbooks: ProviderSportsbook[] = BOOKS,
  ): Promise<OddsQuote[]> {
    if (season !== SEASON || week !== WEEK) return [];
    const fetchedAt = nowIso();
    const quotes: OddsQuote[] = [];

    eligiblePlayers().forEach((player, index) => {
      const gameId = TEAM_TO_GAME[player.team];
      const base = CONSENSUS_AMERICAN[player.external_player_id];
      for (const book of sportsbooks) {
        if (book === "Consensus") continue;
        const american = base + bookOffset(book, index);
        quotes.push(
          makeQuote(
            player.external_player_id,
            gameId,
            book,
            american,
            fetchedAt,
          ),
        );
      }
    });

    return quotes;
  }

  async getConsensusAnytimeTdOdds(
    season: number,
    week: number,
  ): Promise<ConsensusOdds[]> {
    const books = await this.getAnytimeTdOdds(season, week, BOOKS);
    if (books.length === 0) return [];

    const byPlayer = new Map<string, OddsQuote[]>();
    for (const quote of books) {
      const list = byPlayer.get(quote.external_player_id) ?? [];
      list.push(quote);
      byPlayer.set(quote.external_player_id, list);
    }

    const fetchedAt = nowIso();
    const consensus: ConsensusOdds[] = [];

    for (const [playerId, playerBooks] of byPlayer) {
      const avgAmerican = Math.round(
        playerBooks.reduce((sum, q) => sum + q.american_odds, 0) /
          playerBooks.length,
      );
      const decimal = Number(americanToDecimal(avgAmerican).toFixed(4));
      consensus.push({
        external_player_id: playerId,
        external_game_id: playerBooks[0].external_game_id,
        american_odds: avgAmerican,
        decimal_odds: decimal,
        implied_probability: Number(
          impliedProbabilityFromAmerican(avgAmerican).toFixed(4),
        ),
        books: playerBooks,
        fetched_at: fetchedAt,
      });
    }

    return consensus.sort(
      (a, b) => b.implied_probability - a.implied_probability,
    );
  }

  async getPlayerOdds(
    externalPlayerId: string,
    season: number,
    week: number,
  ): Promise<OddsQuote[]> {
    const all = await this.getAnytimeTdOdds(season, week);
    return all.filter((q) => q.external_player_id === externalPlayerId);
  }
}

export function createMockOddsProvider(): OddsProvider {
  return new MockOddsProvider();
}

export { CONSENSUS_AMERICAN };
