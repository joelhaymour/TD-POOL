import type { League, LeagueSection, LeagueSections } from "@/lib/types";

/**
 * The three things a league can be, in the order they appear in the header.
 * `path` is the URL segment under the league slug.
 */
export type SectionDef = {
  key: LeagueSection;
  path: string;
  label: string;
  blurb: string;
};

export const SECTIONS: SectionDef[] = [
  {
    key: "td_pool",
    path: "pool",
    label: "TD Pool",
    blurb: "Everyone picks one player to score a TD each week. The classic.",
  },
  {
    key: "group_bets",
    path: "group",
    label: "Group Bets",
    blurb: "Build shared parlays from every prop, then ride the placed bet.",
  },
  {
    key: "tickets",
    path: "tickets",
    label: "Tickets",
    blurb: "Post the bets you placed. Everyone follows along and rides them.",
  },
];

const BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));
const BY_PATH = new Map(SECTIONS.map((s) => [s.path, s]));

export function sectionDef(key: LeagueSection): SectionDef {
  return BY_KEY.get(key)!;
}

export function sectionByPath(path: string | undefined): SectionDef | null {
  return path ? (BY_PATH.get(path) ?? null) : null;
}

export function enabledSections(
  league: Pick<League, "sections">,
): SectionDef[] {
  return SECTIONS.filter((s) => league.sections[s.key]);
}

export function sectionEnabled(
  league: Pick<League, "sections">,
  key: LeagueSection,
): boolean {
  return Boolean(league.sections[key]);
}

/** A copy of the league with the given sections switched off (display only). */
export function withoutSections<T extends Pick<League, "sections">>(
  league: T,
  hidden: readonly LeagueSection[],
): T {
  if (hidden.length === 0) return league;
  const sections = { ...league.sections };
  for (const key of hidden) sections[key] = false;
  return { ...league, sections };
}

/** Where `/<slug>` lands: the first section that is on. */
export function defaultSection(league: Pick<League, "sections">): SectionDef {
  return enabledSections(league)[0] ?? SECTIONS[0];
}

export function sectionHref(slug: string, key: LeagueSection): string {
  return `/${slug}/${sectionDef(key).path}`;
}

/** The cookie that remembers which section a member was last in. */
export function sectionCookieName(slug: string): string {
  return `tdp_section_${slug.replace(/[^a-z0-9-]/gi, "")}`;
}

export const ALL_SECTIONS_ON: LeagueSections = {
  td_pool: true,
  group_bets: true,
  tickets: true,
};

/** Only real booleans get through a request body; anything else is ignored. */
export function sectionsFromBody(
  raw: unknown,
): Partial<LeagueSections> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<LeagueSections> = {};
  for (const key of ["td_pool", "group_bets", "tickets"] as const) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

/** Merge a partial toggle set onto the current one, keeping at least one on. */
export function mergeSections(
  current: LeagueSections,
  patch: Partial<LeagueSections> | undefined,
): LeagueSections {
  const next = { ...current, ...(patch ?? {}) };
  if (!next.td_pool && !next.group_bets && !next.tickets) return current;
  return next;
}
