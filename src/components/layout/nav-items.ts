import { enabledSections } from "@/lib/league/sections";
import type { League, LeagueSection } from "@/lib/types";

export type BottomNavItem = {
  href: string;
  label: string;
  icon: "picks" | "league" | "slip" | "create" | "history" | "board" | "ticket";
  badge?: number;
};

/** One section's bottom bar: its root path (exact-match tab) and its tabs. */
export type SectionNav = {
  key: LeagueSection;
  path: string;
  basePath: string;
  items: BottomNavItem[];
};

/**
 * Single source of truth for the league bottom nav (avoids SSR/client label
 * drift). Kept out of the `"use client"` nav module so server components can
 * build the list and hand it down as props.
 */
export function poolNavItems(basePath: string): BottomNavItem[] {
  return [
    { href: basePath, label: "Picks", icon: "picks" },
    { href: `${basePath}/slip`, label: "Slip", icon: "slip" },
    { href: `${basePath}/history`, label: "History", icon: "history" },
    { href: `${basePath}/board`, label: "Board", icon: "board" },
  ];
}

export function ticketsNavItems(basePath: string): BottomNavItem[] {
  return [
    { href: basePath, label: "Tickets", icon: "ticket" },
    { href: `${basePath}/history`, label: "History", icon: "history" },
    { href: `${basePath}/board`, label: "Board", icon: "board" },
  ];
}

/** The bars for every section this league has on, in header order. */
export function leagueSectionNavs(
  slug: string,
  league: Pick<League, "sections">,
): SectionNav[] {
  return enabledSections(league).map((section) => {
    const basePath = `/${slug}/${section.path}`;
    const items =
      section.key === "td_pool" ? poolNavItems(basePath) : ticketsNavItems(basePath);
    return { key: section.key, path: section.path, basePath, items };
  });
}
