import { after } from "next/server";
import { DashboardClient } from "@/components/league/dashboard-client";
import {
  loadLeagueDashboard,
  refreshLeagueData,
} from "@/lib/league/load-dashboard";
import { requireSectionAccess } from "@/lib/auth/league";

/** A first-run board build happens inline; background refresh also runs here. */
export const maxDuration = 300;

export default async function PoolPage({
  params,
  searchParams,
}: PageProps<"/[slug]/pool">) {
  const { slug } = await params;
  const { game } = await searchParams;
  const { member } = await requireSectionAccess(slug, "td_pool");
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
