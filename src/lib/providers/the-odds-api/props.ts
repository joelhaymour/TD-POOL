import {
  americanToDecimal,
} from "@/lib/utils/odds";
import { teamFullToAbbr } from "@/lib/providers/the-odds-api/maps";
import { ODDS_QUOTA_EXHAUSTED } from "@/lib/providers/the-odds-api/provider";
import { propMarketDef } from "@/lib/props/markets";

const SPORT = "americanfootball_nfl";

/** FanDuel is the base book for group betting: deep links + one credit lane. */
const PROPS_BOOKMAKER = "fanduel";

type ApiEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

type ApiOutcome = {
  name: string;
  description?: string;
  price: number;
  point?: number;
  link?: string;
  sid?: string;
};

type ApiMarket = { key: string; outcomes: ApiOutcome[] };
type ApiBookmaker = { key: string; markets: ApiMarket[] };
type ApiEventOdds = ApiEvent & { bookmakers: ApiBookmaker[] };

/** One raw selection from the book, before store ids are attached. */
export type RawGameProp = {
  market_key: string;
  market_label: string;
  market_group: import("@/lib/types").PropMarketGroup;
  player_name: string | null;
  outcome_label: string;
  line: number | null;
  american_odds: number;
  decimal_odds: number;
  fd_market_id: string | null;
  fd_selection_id: string | null;
  deep_link: string | null;
};

export type GamePropsFetchResult = {
  props: RawGameProp[];
  creditsUsed: number;
  quotaRemaining: number | null;
};

async function getJson<T>(
  url: string,
  onHeaders: (res: Response) => void,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  onHeaders(res);
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

/**
 * Find The Odds API event id for one of our games by matching home/away
 * abbreviations. The /events endpoint is free.
 */
function headerNumber(res: Response, name: string): number | null {
  const raw = res.headers.get(name);
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function findEventForGame(
  apiKey: string,
  game: { home_team: string; away_team: string },
): Promise<{ event: ApiEvent | null; creditsRemaining: number | null }> {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT}/events`);
  url.searchParams.set("apiKey", apiKey);
  let creditsRemaining: number | null = null;
  const events = await getJson<ApiEvent[]>(url.toString(), (res) => {
    creditsRemaining = headerNumber(res, "x-requests-remaining");
  });
  const event =
    events.find(
      (e) =>
        teamFullToAbbr(e.home_team) === game.home_team &&
        teamFullToAbbr(e.away_team) === game.away_team,
    ) ?? null;
  return { event, creditsRemaining };
}

/** The FanDuel "marketId" is embedded in addToBetslip links; sid is selectionId. */
function parseFdIds(link: string | undefined, sid: string | undefined): {
  fd_market_id: string | null;
  fd_selection_id: string | null;
} {
  let marketId: string | null = null;
  if (link) {
    const match = link.match(/marketId=([0-9.]+)/);
    if (match) marketId = match[1] ?? null;
  }
  return { fd_market_id: marketId, fd_selection_id: sid ?? null };
}

function outcomeToProp(
  market: ApiMarket,
  outcome: ApiOutcome,
): RawGameProp | null {
  const def = propMarketDef(market.key);
  if (!def) return null;
  if (typeof outcome.price !== "number") return null;

  const american = Math.round(outcome.price);
  // Player markets put the player in `description` and Over/Under/Yes in
  // `name`; team totals do the same with the team. Other game markets put the
  // team (or Over/Under) in `name`.
  const isPlayerMarket = market.key.startsWith("player_");
  const subject =
    isPlayerMarket || market.key === "team_totals"
      ? (outcome.description ?? outcome.name)
      : null;
  let outcomeLabel = outcome.name;
  if (isPlayerMarket && outcome.name === subject) outcomeLabel = "Yes";
  // The "No" side of a scorer market is noise on a pick-to-happen slip.
  if (
    (market.key === "player_anytime_td" ||
      market.key === "player_1st_td" ||
      market.key === "player_last_td") &&
    outcomeLabel.toLowerCase() === "no"
  ) {
    return null;
  }

  const { fd_market_id, fd_selection_id } = parseFdIds(
    outcome.link,
    outcome.sid,
  );

  return {
    market_key: market.key,
    market_label: def.label,
    market_group: def.group,
    player_name: subject,
    outcome_label: outcomeLabel,
    line: typeof outcome.point === "number" ? outcome.point : null,
    american_odds: american,
    decimal_odds: Number(americanToDecimal(american).toFixed(4)),
    fd_market_id,
    fd_selection_id,
    deep_link: outcome.link ?? null,
  };
}

/**
 * Fetch a FanDuel prop board for one event. Cost: one credit per requested
 * market FanDuel actually prices (~12-16 for the core set).
 */
export async function fetchEventProps(
  apiKey: string,
  eventId: string,
  marketKeys: string[],
): Promise<GamePropsFetchResult> {
  const url = new URL(
    `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${eventId}/odds`,
  );
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("bookmakers", PROPS_BOOKMAKER);
  url.searchParams.set("markets", marketKeys.join(","));
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("includeLinks", "true");
  url.searchParams.set("includeSids", "true");

  let creditsUsed = 0;
  let quotaRemaining: number | null = null;
  const data = await getJson<ApiEventOdds>(url.toString(), (res) => {
    creditsUsed = headerNumber(res, "x-requests-last") ?? 0;
    quotaRemaining = headerNumber(res, "x-requests-remaining");
  });

  const props: RawGameProp[] = [];
  const book = (data.bookmakers ?? []).find((b) => b.key === PROPS_BOOKMAKER);
  for (const market of book?.markets ?? []) {
    for (const outcome of market.outcomes ?? []) {
      const prop = outcomeToProp(market, outcome);
      if (prop) props.push(prop);
    }
  }
  return { props, creditsUsed, quotaRemaining };
}
