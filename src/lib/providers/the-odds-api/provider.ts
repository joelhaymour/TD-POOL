import {
  americanToDecimal,
  impliedProbabilityFromAmerican,
} from "@/lib/utils/odds";
import { consensusImpliedFromAmericans } from "@/lib/model/math";
import {
  BOOKMAKER_KEY_MAP,
  DEFAULT_ODDS_API_BOOKMAKERS,
  livePreferredRoster,
  resolveRosterPlayer,
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

/**
 * Distinct from a plan/permission failure: the key is valid and has props
 * access, it has simply spent its monthly credits. Fixed by waiting for the
 * reset or topping up, not by changing keys.
 */
export const ODDS_QUOTA_EXHAUSTED =
  "The Odds API monthly credit allowance is used up — odds resume when it resets or the plan is topped up";

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
  /**
   * Unused when `bookmakers` is set. Do not pass `us,uk` — that doubles cost.
   */
  regions?: string;
  /** Comma-separated keys. ≤10 = 1 credit per event, even if Bet365 is included. */
  bookmakers?: string;
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
  private bookmakers: string;
  private quotaRemaining: number | null = null;
  private creditsUsedThisFetch = 0;
  private unmappedBookmakers = new Set<string>();

  getQuotaRemaining(): number | null {
    return this.quotaRemaining;
  }

  getCreditsUsedThisFetch(): number {
    return this.creditsUsedThisFetch;
  }

  getUnmappedBookmakers(): string[] {
    return [...this.unmappedBookmakers].sort();
  }

  private roster: NonNullable<TheOddsApiProviderOptions["roster"]>;
  private games: NonNullable<TheOddsApiProviderOptions["games"]>;
  private fetchImpl: typeof fetch;

  constructor(options: TheOddsApiProviderOptions) {
    this.apiKey = options.apiKey;
    this.regions = options.regions ?? "us";
    this.bookmakers =
      options.bookmakers?.trim() || DEFAULT_ODDS_API_BOOKMAKERS.join(",");
    this.roster = livePreferredRoster(options.roster ?? []);
    this.games = options.games ?? [];
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.creditsUsedThisFetch = 0;
  }

  private async getJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    // The /events endpoint is free and reports the remaining allowance, so
    // reading it here lets us skip the billed per-event calls entirely once the
    // quota is gone instead of firing a dozen requests that can only fail.
    const remaining = Number(res.headers.get("x-requests-remaining"));
    if (Number.isFinite(remaining)) this.quotaRemaining = remaining;
    // /events is free; only event-odds calls should count toward the slate cost.
    if (url.includes("/odds")) {
      const last = Number(res.headers.get("x-requests-last"));
      if (Number.isFinite(last) && last > 0) this.creditsUsedThisFetch += last;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (body.includes("OUT_OF_USAGE_CREDITS")) {
        throw new Error(ODDS_QUOTA_EXHAUSTED);
      }
      throw new Error(
        `The Odds API ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      );
    }
    return (await res.json()) as T;
  }

  private resolvePlayerId(
    description: string | undefined,
    eventTeams?: { home?: string | null; away?: string | null },
  ): string | null {
    if (!description) return null;
    return (
      resolveRosterPlayer(description, this.roster, eventTeams)
        ?.external_player_id ?? null
    );
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
    // Up to ten explicit books count as one region for billing. Request only
    // documented NFL books by default; extra regions cannot add missing coverage.
    if (this.bookmakers) {
      url.searchParams.set("bookmakers", this.bookmakers);
    } else {
      url.searchParams.set("regions", this.regions || "us");
    }
    url.searchParams.set("markets", MARKET);
    url.searchParams.set("oddsFormat", "american");
    return this.getJson<OddsApiEventOdds>(url.toString());
  }

  async getAnytimeTdOdds(
    _season: number,
    _week: number,
    sportsbooks?: ProviderSportsbook[],
  ): Promise<OddsQuote[]> {
    this.creditsUsedThisFetch = 0;
    this.unmappedBookmakers.clear();
    const fetchedAt = nowIso();
    const events = await this.listEvents();
    const allowed = sportsbooks
      ? new Set(sportsbooks.filter((b) => b !== "Consensus"))
      : null;

    // Only pull near-term NFL games (this week), not the entire season calendar.
    // The window is one week rather than two because every extra event in it is
    // a billed credit, and next week's props are mostly unposted anyway.
    const now = Date.now();
    const horizonMs = 7 * 24 * 60 * 60_000;
    const upcoming = events.filter((e) => {
      const t = Date.parse(e.commence_time);
      return Number.isFinite(t) && t >= now - 6 * 60 * 60_000 && t <= now + horizonMs;
    });

    if (this.quotaRemaining != null && this.quotaRemaining <= 0) {
      throw new Error(ODDS_QUOTA_EXHAUSTED);
    }

    const quotes: OddsQuote[] = [];
    let authFailures = 0;
    let quotaFailures = 0;
    let attempted = 0;

    const batchSize = 3;
    for (let i = 0; i < upcoming.length; i += batchSize) {
      const batch = upcoming.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((e) => this.eventAnytimeTd(e.id)),
      );

      for (let j = 0; j < results.length; j += 1) {
        const result = results[j]!;
        const eventMeta = batch[j]!;
        attempted += 1;
        if (result.status !== "fulfilled") {
          const msg = String(result.reason ?? "");
          if (msg.includes(ODDS_QUOTA_EXHAUSTED)) quotaFailures += 1;
          else if (msg.includes("401") || msg.includes("403")) authFailures += 1;
          continue;
        }
        const eventOdds = result.value;
        const homeFull = eventOdds.home_team ?? eventMeta.home_team;
        const awayFull = eventOdds.away_team ?? eventMeta.away_team;
        const gameId = this.resolveGameId(homeFull, awayFull);
        if (!gameId) continue;
        const eventTeams = {
          home: teamFullToAbbr(homeFull),
          away: teamFullToAbbr(awayFull),
        };

        for (const book of eventOdds.bookmakers ?? []) {
          const mapped = BOOKMAKER_KEY_MAP[book.key];
          if (!mapped) {
            this.unmappedBookmakers.add(book.key);
            continue;
          }
          if (allowed && !allowed.has(mapped)) continue;

          const market = book.markets.find((m) => m.key === MARKET);
          if (!market) continue;

          for (const outcome of market.outcomes) {
            const isYes =
              outcome.name.toLowerCase() === "yes" ||
              !outcome.description ||
              outcome.name === outcome.description;
            const playerName = outcome.description ?? outcome.name;
            if (!isYes && outcome.name.toLowerCase() === "no") continue;

            const externalPlayerId = this.resolvePlayerId(
              playerName,
              eventTeams,
            );
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

    // Quota exhaustion also returns 401, so it used to be reported as if the
    // key lacked player-props access. They need different fixes.
    if (quotaFailures > 0 && quotaFailures === attempted) {
      throw new Error(ODDS_QUOTA_EXHAUSTED);
    }
    if (attempted > 0 && authFailures === attempted) {
      throw new Error(
        "The Odds API denied player_anytime_td (401/403) — upgrade plan or use a key with player props access",
      );
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
