import { cache } from "react";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import type { LeagueMember } from "@/lib/types";
import { getStore } from "@/lib/store";
import { requireUser } from "@/lib/auth/session";

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
