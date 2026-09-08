import { after } from "next/server";
import { DashboardClient } from "@/components/league/dashboard-client";
import {
  loadLeagueDashboard,
  refreshLeagueData,
} from "@/lib/league/load-dashboard";

/** A first-run board build happens inline; background refresh also runs here. */
export const maxDuration = 300;

export default async function LeagueDashboardPage({
  params,
}: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const dashboard = await loadLeagueDashboard(slug);

  after(() => refreshLeagueData(slug));

  return <DashboardClient slug={slug} initialDashboard={dashboard} />;
}
