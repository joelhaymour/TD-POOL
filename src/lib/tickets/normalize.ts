import { TEAM_ABBR_TO_FULL, normalizeTeamAbbr, teamNickname } from "@/lib/nfl/teams";
import { isAlternateMarket, propMarketDef } from "@/lib/props/markets";
import { sportsbook } from "@/lib/props/sportsbooks";
import { americanToDecimal, decimalToAmerican } from "@/lib/utils/odds";
import type { ReadLegRaw, ReadTicketRaw } from "@/lib/tickets/reader";
import type { NflGame } from "@/lib/types";

/**
 * One leg as the review screen shows it and the post route accepts it. The
 * same shape a group-bet leg is stored in, so grading treats both alike.
 */
export type TicketLegDraft = {
  /** Client-side key while the leg is being edited. */
  key: string;
  raw_text: string;
  game_id: string | null;
  market_key: string | null;
  market_label: string;
  player_name: string | null;
  outcome_label: string;
  line: number | null;
  american_odds: number | null;
  confidence: "high" | "medium" | "low";
  /** What still needs a human before this leg can be posted. */
  issues: string[];
};

export type TicketDraft = {
  /** A known book's key, or a share link's bare host. */
  sportsbook: string | null;
  bet_type: ReadTicketRaw["bet_type"];
  stake: number | null;
  currency: "USD" | "CAD" | null;
  book_odds: number | null;
  book_payout: number | null;
  legs: TicketLegDraft[];
  notes: string | null;
};

const TEAM_MARKETS = new Set([
  "h2h",
  "h2h_h1",
  "h2h_q1",
  "spreads",
  "spreads_h1",
  "spreads_q1",
  "alternate_spreads",
]);
const TOTAL_MARKETS = new Set([
  "totals",
  "totals_h1",
  "totals_q1",
  "alternate_totals",
  "team_totals",
]);

/** "Bills", "BUF", "buffalo bills" → "Buffalo Bills". */
export function resolveTeamFull(text: string | null | undefined): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const abbr = normalizeTeamAbbr(raw);
  if (TEAM_ABBR_TO_FULL[abbr]) return TEAM_ABBR_TO_FULL[abbr];
  const lower = raw.toLowerCase();
  for (const [code, full] of Object.entries(TEAM_ABBR_TO_FULL)) {
    if (full.toLowerCase() === lower) return full;
    if (teamNickname(code).toLowerCase() === lower) return full;
    if (lower.endsWith(` ${teamNickname(code).toLowerCase()}`)) return full;
  }
  return null;
}

/**
 * "Michael Pittman Jr." and "Michael Pittman" are the same player: lowercase,
 * no punctuation, no generational suffix.
 */
export function playerKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which of these games a player is in this week, from our own data; null when unknown or ambiguous. */
export type PlayerGameLookup = (playerName: string) => string | null;

/** A leg's game, when the model left it blank but named the teams. */
function guessGame(leg: ReadLegRaw, games: NflGame[]): string | null {
  const text = `${leg.raw_text} ${leg.outcome ?? ""} ${leg.player_name ?? ""}`.toLowerCase();
  const hits = games.filter((g) =>
    [g.home_team, g.away_team].some((abbr) => {
      const nick = teamNickname(abbr).toLowerCase();
      return text.includes(nick) || text.includes(` ${abbr.toLowerCase()} `);
    }),
  );
  return hits.length === 1 ? hits[0].id : null;
}

function normalizeOutcome(
  marketKey: string,
  raw: string | null,
  teamFull: string | null,
): string | null {
  const side = (raw ?? "").trim().toLowerCase();
  if (TEAM_MARKETS.has(marketKey)) return teamFull;
  if (isAlternateMarket(marketKey)) return "Over";
  if (side === "over" || side === "o") return "Over";
  if (side === "under" || side === "u") return "Under";
  if (side === "yes" || side === "") return "Yes";
  if (side === "no") return "No";
  return null;
}

function priceOf(leg: {
  american_odds: number | null;
  decimal_odds: number | null;
}): number | null {
  if (leg.american_odds != null && leg.american_odds !== 0) {
    return Math.round(leg.american_odds);
  }
  if (leg.decimal_odds != null && leg.decimal_odds > 1) {
    return decimalToAmerican(leg.decimal_odds);
  }
  return null;
}

export function normalizeLeg(
  leg: ReadLegRaw,
  games: NflGame[],
  index: number,
  gameForPlayer?: PlayerGameLookup,
): TicketLegDraft {
  const issues: string[] = [];
  const gameIds = new Set(games.map((g) => g.id));
  // This week's player data knows which game each player is in, and it
  // follows trades, which a model's memory may not. It wins over the read.
  const known = leg.player_name && gameForPlayer ? gameForPlayer(leg.player_name) : null;
  const game_id =
    (known && gameIds.has(known) ? known : null) ??
    (leg.game_id && gameIds.has(leg.game_id) ? leg.game_id : guessGame(leg, games));
  if (!game_id) issues.push("Pick the game");

  const def = leg.market_key ? propMarketDef(leg.market_key) : null;
  if (!def) issues.push("Pick the market");
  const market_key = def?.key ?? null;

  const teamMarket = market_key ? TEAM_MARKETS.has(market_key) : false;
  const teamTotal = market_key === "team_totals";
  const teamFull = teamMarket
    ? resolveTeamFull(leg.outcome) ?? resolveTeamFull(leg.player_name)
    : teamTotal
      ? resolveTeamFull(leg.player_name) ?? resolveTeamFull(leg.outcome)
      : null;

  const player_name = teamMarket
    ? null
    : teamTotal
      ? teamFull
      : (leg.player_name?.trim() ?? null);
  if (market_key && !teamMarket && !TOTAL_MARKETS.has(market_key) && !player_name) {
    issues.push("Who is the player?");
  }
  if ((teamMarket || teamTotal) && !teamFull) issues.push("Which team?");

  const outcome_label = market_key
    ? normalizeOutcome(market_key, leg.outcome, teamFull)
    : null;
  if (market_key && !outcome_label) issues.push("Over or under?");

  const needsLine =
    market_key != null &&
    market_key !== "player_anytime_td" &&
    market_key !== "player_1st_td" &&
    market_key !== "player_last_td" &&
    !market_key.startsWith("h2h");
  const line = leg.line != null && Number.isFinite(leg.line) ? leg.line : null;
  if (needsLine && line == null) issues.push("What's the line?");

  return {
    key: `read-${index}`,
    raw_text: leg.raw_text,
    game_id,
    market_key,
    market_label: def?.label ?? leg.market_key ?? "",
    player_name,
    outcome_label: outcome_label ?? "",
    line: needsLine ? line : null,
    american_odds: priceOf(leg),
    confidence: leg.confidence,
    issues,
  };
}

export function normalizeTicket(
  raw: ReadTicketRaw,
  games: NflGame[],
  bookHint: string | null,
  gameForPlayer?: PlayerGameLookup,
): TicketDraft {
  const book = raw.sportsbook ? sportsbook(raw.sportsbook)?.key ?? null : null;
  return {
    sportsbook: bookHint ?? book,
    bet_type: raw.bet_type,
    stake: raw.stake,
    currency: raw.currency,
    book_odds: priceOf(raw),
    book_payout: raw.potential_payout,
    legs: raw.legs.map((leg, i) => normalizeLeg(leg, games, i, gameForPlayer)),
    // A note that talks about ids or confidence is the model thinking aloud,
    // not something the person posting can act on.
    notes: raw.notes && !/game_id|confidence|provided list/i.test(raw.notes) ? raw.notes : null,
  };
}

/** Decimal for a stored leg; null when the slip showed no price for it. */
export function legDecimal(american: number | null): number | null {
  return american != null && american !== 0 ? americanToDecimal(american) : null;
}

/** Re-check a leg after the member edited it in review. */
export function legIssues(
  leg: Pick<
    TicketLegDraft,
    "game_id" | "market_key" | "player_name" | "outcome_label" | "line"
  >,
): string[] {
  const issues: string[] = [];
  if (!leg.game_id) issues.push("Pick the game");
  const def = leg.market_key ? propMarketDef(leg.market_key) : null;
  if (!def) {
    issues.push("Pick the market");
    return issues;
  }
  const key = def.key;
  const teamMarket = TEAM_MARKETS.has(key);
  const teamTotal = key === "team_totals";
  if (teamMarket && !resolveTeamFull(leg.outcome_label)) issues.push("Which team?");
  if (teamTotal && !resolveTeamFull(leg.player_name)) issues.push("Which team?");
  if (!teamMarket && !TOTAL_MARKETS.has(key) && !leg.player_name?.trim()) {
    issues.push("Who is the player?");
  }
  if (!teamMarket && !leg.outcome_label) issues.push("Over or under?");
  const needsLine =
    key !== "player_anytime_td" &&
    key !== "player_1st_td" &&
    key !== "player_last_td" &&
    !key.startsWith("h2h");
  if (needsLine && leg.line == null) issues.push("What's the line?");
  return issues;
}
