import {
  americanToDecimal,
  impliedProbabilityFromAmerican,
} from "@/lib/utils/odds";
import { consensusImpliedFromAmericans } from "@/lib/model/math";
import {
  BOOKMAKER_KEY_MAP,
  normalizePlayerName,
  teamFullToAbbr,
} from "@/lib/providers/the-odds-api/maps";
import type {
  ConsensusOdds,
  OddsProvider,
  OddsQuote,
  ProviderSportsbook,
} from "@/lib/providers/types";

const SPORT = "americanfootball_nfl";
const MARKET = "player_anytime_td";

type OddsApiEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

type OddsApiOutcome = {
  name: string;
  description?: string;
  price: number;
};

type OddsApiMarket = {
  key: string;
  outcomes: OddsApiOutcome[];
};

type OddsApiBookmaker = {
  key: string;
  title: string;
  markets: OddsApiMarket[];
};

type OddsApiEventOdds = OddsApiEvent & {
  bookmakers: OddsApiBookmaker[];
};

export type TheOddsApiProviderOptions = {
  apiKey: string;
  regions?: string;
  /** Optional roster for name → external_player_id matching. */
  roster?: Array<{
    external_player_id: string;
    name: string;
    team: string;
  }>;
  /** Map our external_game_id → home/away abbr for linking. */
  games?: Array<{
    external_game_id: string;
    home_team: string;
    away_team: string;
  }>;
  fetchImpl?: typeof fetch;
};

function nowIso(): string {
  return new Date().toISOString();
}

export class TheOddsApiProvider implements OddsProvider {
  private apiKey: string;
  private regions: string;
  private roster: NonNullable<TheOddsApiProviderOptions["roster"]>;
  private games: NonNullable<TheOddsApiProviderOptions["games"]>;
  private fetchImpl: typeof fetch;
  private nameIndex: Map<string, string>;

  constructor(options: TheOddsApiProviderOptions) {
    this.apiKey = options.apiKey;
    this.regions = options.regions ?? "us";
    this.roster = options.roster ?? [];
    this.games = options.games ?? [];
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.nameIndex = new Map(
      this.roster.map((p) => [
        normalizePlayerName(p.name),
        p.external_player_id,
      ]),
    );
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchImpl(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `The Odds API ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      );
    }
    return (await res.json()) as T;
  }

  private resolvePlayerId(description: string | undefined): string | null {
    if (!description) return null;
    const key = normalizePlayerName(description);
    if (this.nameIndex.has(key)) return this.nameIndex.get(key)!;

    // Soft match: last name + first initial only (avoid "includes" false positives).
    const parts = key.split(" ").filter(Boolean);
    if (parts.length < 2) return null;
    const last = parts.at(-1)!;
    const firstInitial = parts[0]![0];
    const hits: string[] = [];
    for (const [norm, id] of this.nameIndex) {
      const a = norm.split(" ").filter(Boolean);
      if (a.length < 2) continue;
      if (a.at(-1) === last && a[0]?.[0] === firstInitial) {
        hits.push(id);
      }
    }
    return hits.length === 1 ? hits[0]! : null;
  }

  private resolveGameId(homeFull: string, awayFull: string): string | null {
    const home = teamFullToAbbr(homeFull);
    const away = teamFullToAbbr(awayFull);
    if (!home || !away) return null;
    const hit = this.games.find(
      (g) => g.home_team === home && g.away_team === away,
    );
    return hit?.external_game_id ?? `oddsapi:${away}@${home}`;
  }

  private async listEvents(): Promise<OddsApiEvent[]> {
    const url = new URL(
      `https://api.the-odds-api.com/v4/sports/${SPORT}/events`,
    );
    url.searchParams.set("apiKey", this.apiKey);
    return this.getJson<OddsApiEvent[]>(url.toString());
  }

  private async eventAnytimeTd(eventId: string): Promise<OddsApiEventOdds> {
    const url = new URL(
      `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${eventId}/odds`,
    );
    url.searchParams.set("apiKey", this.apiKey);
    url.searchParams.set("regions", this.regions);
    url.searchParams.set("markets", MARKET);
    url.searchParams.set("oddsFormat", "american");
    return this.getJson<OddsApiEventOdds>(url.toString());
  }

  async getAnytimeTdOdds(
    _season: number,
    _week: number,
    sportsbooks?: ProviderSportsbook[],
  ): Promise<OddsQuote[]> {
    const fetchedAt = nowIso();
    const events = await this.listEvents();
    const allowed = sportsbooks
      ? new Set(sportsbooks.filter((b) => b !== "Consensus"))
      : null;

    const quotes: OddsQuote[] = [];

    // Limit concurrent event fetches to protect quota / rate limits
    const batchSize = 3;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((e) => this.eventAnytimeTd(e.id)),
      );

      for (let j = 0; j < results.length; j += 1) {
        const result = results[j]!;
        const eventMeta = batch[j]!;
        if (result.status !== "fulfilled") continue;
        const eventOdds = result.value;
        const gameId = this.resolveGameId(
          eventOdds.home_team ?? eventMeta.home_team,
          eventOdds.away_team ?? eventMeta.away_team,
        );
        if (!gameId) continue;

        for (const book of eventOdds.bookmakers ?? []) {
          const mapped = BOOKMAKER_KEY_MAP[book.key];
          if (!mapped) continue;
          if (allowed && !allowed.has(mapped)) continue;

          const market = book.markets.find((m) => m.key === MARKET);
          if (!market) continue;

          for (const outcome of market.outcomes) {
            // Anytime TD yes outcomes use description = player name
            const isYes =
              outcome.name.toLowerCase() === "yes" ||
              !outcome.description ||
              outcome.name === outcome.description;
            const playerName = outcome.description ?? outcome.name;
            if (!isYes && outcome.name.toLowerCase() === "no") continue;

            const externalPlayerId = this.resolvePlayerId(playerName);
            if (!externalPlayerId) continue;
            if (typeof outcome.price !== "number") continue;

            const american = Math.round(outcome.price);
            quotes.push({
              external_player_id: externalPlayerId,
              external_game_id: gameId,
              sportsbook: mapped,
              market: "anytime_td",
              american_odds: american,
              decimal_odds: Number(americanToDecimal(american).toFixed(4)),
              implied_probability: Number(
                impliedProbabilityFromAmerican(american).toFixed(4),
              ),
              fetched_at: fetchedAt,
            });
          }
        }
      }
    }

    return quotes;
  }

  async getConsensusAnytimeTdOdds(
    season: number,
    week: number,
  ): Promise<ConsensusOdds[]> {
    const books = await this.getAnytimeTdOdds(season, week);
    const byPlayer = new Map<string, OddsQuote[]>();
    for (const quote of books) {
      const list = byPlayer.get(quote.external_player_id) ?? [];
      list.push(quote);
      byPlayer.set(quote.external_player_id, list);
    }

    const fetchedAt = nowIso();
    const consensus: ConsensusOdds[] = [];
    for (const [playerId, playerBooks] of byPlayer) {
      const americans = playerBooks.map((q) => q.american_odds);
      const agg = consensusImpliedFromAmericans(americans);
      if (!agg) continue;
      consensus.push({
        external_player_id: playerId,
        external_game_id: playerBooks[0]!.external_game_id,
        american_odds: agg.american,
        decimal_odds: agg.decimal,
        implied_probability: agg.implied,
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

export function createTheOddsApiProvider(
  options: TheOddsApiProviderOptions,
): OddsProvider {
  return new TheOddsApiProvider(options);
}
