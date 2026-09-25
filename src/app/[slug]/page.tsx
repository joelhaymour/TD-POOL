import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireViewerMembership } from "@/lib/auth/league";
import {
  defaultSection,
  sectionByPath,
  sectionCookieName,
} from "@/lib/league/sections";
import { getStore } from "@/lib/store";
import { enabledSections } from "@/lib/league/sections";
import { visibleLeague } from "@/lib/native/server";

/**
 * `/<slug>` is the invite link and the home-screen icon, so it has to land
 * somewhere useful: the section the member was last in, or the first one the
 * league runs. Query strings are carried across for links that predate the
 * sections (`?slip=` from a parlay tile, `?game=` from a player page).
 */
export default async function LeagueEntryPage({
  params,
  searchParams,
}: PageProps<"/[slug]">) {
  const { slug } = await params;
  await requireViewerMembership(slug);
  const stored = await getStore().getLeagueBySlug(slug);
  if (!stored) redirect("/");
  const league = await visibleLeague(stored);
  // A league that only runs sections the app hides has nothing to show here.
  if (enabledSections(league).length === 0) redirect("/");

  const remembered = sectionByPath(
    (await cookies()).get(sectionCookieName(slug))?.value,
  );
  const section =
    remembered && league.sections[remembered.key]
      ? remembered
      : defaultSection(league);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  const suffix = query.size > 0 ? `?${query}` : "";
  redirect(`/${slug}/${section.path}${suffix}`);
}
