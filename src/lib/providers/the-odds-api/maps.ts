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

export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map Odds API bookmaker keys to our display sportsbooks. */
export const BOOKMAKER_KEY_MAP: Record<
  string,
  "FanDuel" | "DraftKings" | "Bet365" | "BetMGM" | "Caesars" | "Fanatics"
> = {
  fanduel: "FanDuel",
  draftkings: "DraftKings",
  // The API has no bet365 for NFL in any region — the sole listing is
  // bet365_au, which is paid-only and covers AFL and NRL. Kept mapped so the
  // odds appear automatically if that ever changes.
  bet365: "Bet365",
  betmgm: "BetMGM",
  williamhill_us: "Caesars",
  caesars: "Caesars",
  fanatics: "Fanatics",
};
