import { after } from "next/server";
import { DashboardClient } from "@/components/league/dashboard-client";
import { GroupBettingClient } from "@/components/betting/group-betting-client";
import {
  loadLeagueDashboard,
  refreshLeagueData,
} from "@/lib/league/load-dashboard";
import { requireViewerMembership } from "@/lib/auth/league";
import { getStore } from "@/lib/store";
import { loadGroupHome } from "@/lib/props/load-group-home";
import { refreshGroupLeague } from "@/lib/services/refresh-group-league";

/** A first-run board build happens inline; background refresh also runs here. */
export const maxDuration = 300;

export default async function LeagueDashboardPage({
  params,
  searchParams,
}: PageProps<"/[slug]">) {
  const { slug } = await params;
  const { game } = await searchParams;
  const member = await requireViewerMembership(slug);
  const dashboard = await loadLeagueDashboard(slug);

  if (dashboard?.league.league_type === "group_betting") {
    const { slips, games } = await loadGroupHome(
      getStore(),
      dashboard.league,
      dashboard.week.id,
    );
    after(() => refreshGroupLeague(slug));
    return (
      <GroupBettingClient
        slug={slug}
        league={dashboard.league}
        week={dashboard.week}
        members={dashboard.members
          .map((m) => m.member)
          .filter((m) => m.active)}
        initialSlips={slips}
        initialGames={games}
        viewer={{ memberId: member.id, isAdmin: member.role === "admin" }}
      />
    );
  }

  after(() => refreshLeagueData(slug));

  return (
    <DashboardClient
      slug={slug}
      initialDashboard={dashboard}
      viewer={{ memberId: member.id }}
      initialGameId={typeof game === "string" ? game : null}
    />
  );
}
