/** The Odds API name handling, on top of the shared team table. */

import { TEAM_ABBR_TO_FULL } from "@/lib/nfl/teams";

export { TEAM_ABBR_TO_FULL };

const FULL_TO_ABBR = Object.fromEntries(
  Object.entries(TEAM_ABBR_TO_FULL).map(([abbr, full]) => [
    full.toLowerCase(),
    abbr,
  ]),
);

export function teamFullToAbbr(fullName: string): string | null {
  return FULL_TO_ABBR[fullName.trim().toLowerCase()] ?? null;
}

/** Jr / Sr / II / III and the like — books use them, Sleeper often does not. */
const GENERATIONAL_SUFFIXES = new Set([
  "jr",
  "junior",
  "sr",
  "senior",
  "ii",
  "iii",
  "iv",
  "v",
  "2nd",
  "3rd",
  "4th",
  "5th",
]);

export function normalizePlayerName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  while (parts.length > 1 && GENERATIONAL_SUFFIXES.has(parts.at(-1)!)) {
    parts.pop();
  }
  return parts.join(" ");
}

export function isMockRosterId(externalId: string): boolean {
  return externalId.startsWith("p-") || externalId.startsWith("name:");
}

export function isLiveRosterId(externalId: string): boolean {
  return externalId.startsWith("sleeper-") || externalId.startsWith("espn-");
}

/**
 * Prefer Sleeper/ESPN rows when leftover mock seed players share a name.
 * Local seed-only boards keep the `p-*` roster when nothing live exists.
 */
export function livePreferredRoster<T extends { external_player_id: string }>(
  roster: T[],
): T[] {
  const live = roster.filter((p) => isLiveRosterId(p.external_player_id));
  return live.length > 0 ? live : roster;
}

export type RosterNameEntry = {
  external_player_id: string;
  name: string;
  team: string;
};

function sourceScore(externalId: string): number {
  if (externalId.startsWith("sleeper-")) return 4;
  if (externalId.startsWith("espn-")) return 3;
  if (isMockRosterId(externalId)) return 0;
  return 1;
}

function lastAndInitial(
  norm: string,
): { last: string; initial: string } | null {
  const parts = norm.split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return { last: parts.at(-1)!, initial: parts[0]![0]! };
}

function pickUniqueBest(hits: RosterNameEntry[]): RosterNameEntry | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;
  const ranked = hits
    .map((p) => ({ p, score: sourceScore(p.external_player_id) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]!;
  const tied = ranked.filter((r) => r.score === best.score);
  return tied.length === 1 ? best.p : null;
}

/**
 * Map a sportsbook / ESPN display name onto our roster.
 * Exact normalized name first (suffixes already stripped), then last name +
 * first initial. When two people share that, prefer the event's teams, then
 * a live Sleeper id over a leftover mock row.
 */
export function resolveRosterPlayer(
  rawName: string,
  roster: RosterNameEntry[],
  eventTeams?: { home?: string | null; away?: string | null },
): RosterNameEntry | null {
  const key = normalizePlayerName(rawName);
  if (!key) return null;

  const exact: RosterNameEntry[] = [];
  const soft: RosterNameEntry[] = [];
  const want = lastAndInitial(key);

  for (const player of roster) {
    const norm = normalizePlayerName(player.name);
    if (norm === key) {
      exact.push(player);
      continue;
    }
    if (!want) continue;
    const got = lastAndInitial(norm);
    if (got && got.last === want.last && got.initial === want.initial) {
      soft.push(player);
    }
  }

  const pool = exact.length > 0 ? exact : soft;
  if (pool.length === 0) return null;

  const home = eventTeams?.home ?? null;
  const away = eventTeams?.away ?? null;
  const onEvent =
    home || away
      ? pool.filter((p) => p.team === home || p.team === away)
      : [];

  return pickUniqueBest(onEvent.length > 0 ? onEvent : pool);
}

/** Move leftover mock-seed odds onto the live Sleeper/ESPN player of the same name. */
export function mockToLivePlayerMoves(
  players: Array<{
    id: string;
    name: string;
    team: string;
    external_player_id: string | null;
  }>,
): Array<{ fromId: string; toId: string }> {
  const withExt = players.filter(
    (p): p is typeof p & { external_player_id: string } =>
      Boolean(p.external_player_id),
  );
  const roster = livePreferredRoster(
    withExt.map((p) => ({
      external_player_id: p.external_player_id,
      name: p.name,
      team: p.team,
    })),
  );
  const idByExternal = new Map(
    withExt.map((p) => [p.external_player_id, p.id] as const),
  );
  const moves: Array<{ fromId: string; toId: string }> = [];
  for (const player of withExt) {
    if (!isMockRosterId(player.external_player_id)) continue;
    const hit = resolveRosterPlayer(player.name, roster);
    const toId = hit
      ? idByExternal.get(hit.external_player_id)
      : undefined;
    if (!toId || toId === player.id) continue;
    moves.push({ fromId: player.id, toId });
  }
  return moves;
}

/**
 * US books only. Canada (`ca`) is a second billed region with Ontario skins
 * (BetMGM CA, PointsBet CA) whose lines track the US books — not worth 2x
 * credits. UK/AU are not requested; Bet365 is not in the US catalog.
 *
 * ≤10 bookmakers (or one region) = 1 credit per NFL game.
 */
export const DEFAULT_ODDS_API_BOOKMAKERS = [
  "fanduel",
  "draftkings",
  "betmgm",
  "williamhill_us",
  "fanatics",
] as const;

/** Map Odds API bookmaker keys to our display sportsbooks. */
export const BOOKMAKER_KEY_MAP: Record<
  string,
  "FanDuel" | "DraftKings" | "Bet365" | "BetMGM" | "Caesars" | "Fanatics"
> = {
  fanduel: "FanDuel",
  draftkings: "DraftKings",
  // Not requested (not a US book). Mapped so a stray quote still displays.
  bet365: "Bet365",
  bet365_au: "Bet365",
  betmgm: "BetMGM",
  williamhill_us: "Caesars",
  caesars: "Caesars",
  fanatics: "Fanatics",
};
