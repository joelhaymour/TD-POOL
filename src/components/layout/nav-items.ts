export type BottomNavItem = {
  href: string;
  label: string;
  icon: "picks" | "league" | "slip" | "history" | "board";
  badge?: number;
};

/**
 * Single source of truth for the league bottom nav (avoids SSR/client label
 * drift). Kept out of the `"use client"` nav module so server components can
 * build the list and hand it down as props.
 */
export function leagueNavItems(basePath: string): BottomNavItem[] {
  return [
    { href: basePath, label: "Picks", icon: "picks" },
    { href: `${basePath}/bet-slip`, label: "Slip", icon: "slip" },
    { href: `${basePath}/history`, label: "History", icon: "history" },
    { href: `${basePath}/leaderboard`, label: "Board", icon: "board" },
  ];
}

/** Group betting leagues live on one screen: the shared parlay board. */
export function groupBettingNavItems(basePath: string): BottomNavItem[] {
  return [{ href: basePath, label: "Parlays", icon: "slip" }];
}
