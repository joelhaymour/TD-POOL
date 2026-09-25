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
 * Sections the iOS app never shows. Group bets stay on the website (a live
 * league uses them) but are left out of the App Store build.
 */
export const APP_HIDDEN_SECTIONS: LeagueSection[] = ["group_bets"];

/** The sections to hide for this request: none on the web. */
export async function hiddenSections(): Promise<LeagueSection[]> {
  return (await isNativeApp()) ? APP_HIDDEN_SECTIONS : [];
}

/** The league as this request should see it (group bets off inside the app). */
export async function visibleLeague<T extends Pick<League, "sections">>(league: T): Promise<T> {
  return withoutSections(league, await hiddenSections());
}
