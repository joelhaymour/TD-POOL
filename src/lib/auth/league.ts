import { cache } from "react";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import type { League, LeagueMember, LeagueSection } from "@/lib/types";
import { defaultSection } from "@/lib/league/sections";
import { getStore } from "@/lib/store";
import { requireUser } from "@/lib/auth/session";
import { visibleLeague } from "@/lib/native/server";
import { enabledSections } from "@/lib/league/sections";

/**
 * The signed-in user's seat in a league. Cached per request so the layout can
 * gate access and the page can read the member id without a second lookup.
 */
export const getViewerMembership = cache(
  async (slug: string): Promise<LeagueMember | null> => {
    const user = await requireUser(`/${slug}`);
    const store = getStore();

    const league = await store.getLeagueBySlug(slug);
    if (!league) notFound();

    return store.getMemberForUser(league.id, user.id).catch(() => null);
  },
);

/**
 * Same, but sends non-members to the home screen with the join form primed —
 * the usual path for someone opening an invite link for the first time.
 */
export async function requireViewerMembership(
  slug: string,
): Promise<LeagueMember> {
  const member = await getViewerMembership(slug);
  if (!member) redirect(`/?join=${encodeURIComponent(slug)}`);
  return member;
}

/**
 * A section page for a section the league has switched off sends the reader
 * to one it runs, rather than showing an empty screen with the wrong tabs.
 */
export async function requireSectionAccess(
  slug: string,
  section: LeagueSection,
): Promise<{ member: LeagueMember; league: League }> {
  const member = await requireViewerMembership(slug);
  const league = await getStore().getLeagueBySlug(slug);
  if (!league) notFound();
  // Inside the iOS app some sections are hidden; treat them as switched off.
  const visible = await visibleLeague(league);
  if (!visible.sections[section]) {
    if (enabledSections(visible).length === 0) redirect("/");
    redirect(`/${slug}/${defaultSection(visible).path}`);
  }
  return { member, league };
}
