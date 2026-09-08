/** NFL team abbreviation ↔ The Odds API full names. */

export const TEAM_ABBR_TO_FULL: Record<string, string> = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LAC: "Los Angeles Chargers",
  LAR: "Los Angeles Rams",
  LV: "Las Vegas Raiders",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

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
