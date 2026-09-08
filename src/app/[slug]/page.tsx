import { after } from "next/server";
import { DashboardClient } from "@/components/league/dashboard-client";
import {
  loadLeagueDashboard,
  refreshLeagueData,
} from "@/lib/league/load-dashboard";
import { requireViewerMembership } from "@/lib/auth/league";

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
