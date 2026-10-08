import type { Metadata } from "next";
import { getStore } from "@/lib/store";
import { requireUser } from "@/lib/auth/session";
import { ShareFlow, type ShareLeague } from "./share-flow";

export const metadata: Metadata = { title: "Post a ticket · Pool’d" };

/**
 * Where a bet shared from a sportsbook lands (the iPhone app opens it after
 * a share to Pool’d), and the home screen's "Post a ticket": choose one
 * league or several, the slip reads itself, post.
 */
export default async function SharePage() {
  const user = await requireUser("/share");
  const rows = await getStore()
    .listLeaguesForUser(user.id)
    .catch(() => []);
  const leagues: ShareLeague[] = [];
  for (const { league, member } of rows) {
    if (!league.sections.tickets) continue;
    leagues.push({ slug: league.slug, name: league.name, currency: league.currency, pinned: Boolean(member.pinned_at) });
  }
  leagues.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  return <ShareFlow leagues={leagues} />;
}
