import { cache } from "react";
import { headers } from "next/headers";
import { withoutSections } from "@/lib/league/sections";
import type { League, LeagueSection } from "@/lib/types";

/**
 * The iOS app appends "TDPoolApp" to its user agent (capacitor.config.ts →
 * appendUserAgent). Cached per request.
 */
export const isNativeApp = cache(async (): Promise<boolean> => {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes("TDPoolApp");
});

/**
 * Sections Pool’d no longer offers anywhere (2026-09-25: group bets retired).
 * A league's saved switch is left alone, so the data is still there if it
 * ever comes back; it is just never shown, offered or routed to.
 */
export const RETIRED_SECTIONS: LeagueSection[] = ["group_bets"];

/** The sections hidden for every visitor, in the app and on the web. */
export async function hiddenSections(): Promise<LeagueSection[]> {
  return RETIRED_SECTIONS;
}

/** The league as people see it (retired sections switched off). */
export async function visibleLeague<T extends Pick<League, "sections">>(league: T): Promise<T> {
  return withoutSections(league, await hiddenSections());
}
