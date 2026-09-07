import { DashboardClient } from "@/components/league/dashboard-client";
import { loadLeagueDashboard } from "@/lib/league/load-dashboard";

export default async function LeagueDashboardPage({
  params,
}: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const dashboard = await loadLeagueDashboard(slug);

  return <DashboardClient slug={slug} initialDashboard={dashboard} />;
}
