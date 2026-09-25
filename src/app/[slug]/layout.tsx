import { LeagueShell } from "@/components/layout/league-shell";
import { requireViewerMembership } from "@/lib/auth/league";
import { countParlaysNeedingPicks } from "@/lib/props/load-group-home";
import { getStore } from "@/lib/store";
import { visibleLeague } from "@/lib/native/server";

/**
 * The frame every league page sits in: name, week, section switcher and the
 * bottom bar for the section in view. It reads the league row and the week
 * list only — building the TD board belongs to the pool page, and a league
 * that runs no pool must never pay for one.
 */
export default async function LeagueLayout({
  children,
  params,
}: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const member = await requireViewerMembership(slug);
  const store = getStore();
  const stored = await store.getLeagueBySlug(slug);
  const league = stored ? await visibleLeague(stored) : null;

  const week = league?.active_week_id
    ? (await store.listWeeks()).find((w) => w.id === league.active_week_id)
    : undefined;
  const picksNeeded =
    league?.sections.group_bets
      ? await countParlaysNeedingPicks(store, league, member.id)
      : 0;

  return (
    <LeagueShell
      slug={slug}
      league={league ?? { name: "TD Pool", sections: { td_pool: true, group_bets: false, tickets: false } }}
      weekNumber={week?.week ?? 0}
      viewerName={member.display_name}
      picksNeeded={picksNeeded}
    >
      {children}
    </LeagueShell>
  );
}
