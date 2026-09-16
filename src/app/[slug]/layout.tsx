import { LeagueShell } from "@/components/layout/league-shell";
import { loadLeagueDashboard } from "@/lib/league/load-dashboard";
import { requireViewerMembership } from "@/lib/auth/league";
import { countParlaysNeedingPicks } from "@/lib/props/load-group-home";
import { getStore } from "@/lib/store";

export default async function LeagueLayout({
  children,
  params,
}: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const member = await requireViewerMembership(slug);
  const dashboard = await loadLeagueDashboard(slug);

  const groupBetting = dashboard?.league.league_type === "group_betting";
  const picksNeeded =
    groupBetting && dashboard
      ? await countParlaysNeedingPicks(getStore(), dashboard.league, member.id)
      : 0;

  return (
    <LeagueShell
      slug={slug}
      leagueName={dashboard?.league.name ?? "TD Pool"}
      weekNumber={dashboard?.week.week ?? 0}
      viewerName={member.display_name}
      groupBetting={groupBetting}
      picksNeeded={picksNeeded}
    >
      {children}
    </LeagueShell>
  );
}
