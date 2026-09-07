import { LeagueShell } from "@/components/layout/league-shell";
import { loadLeagueDashboard } from "@/lib/league/load-dashboard";

export default async function LeagueLayout({
  children,
  params,
}: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const dashboard = await loadLeagueDashboard(slug);

  return (
    <LeagueShell
      slug={slug}
      leagueName={dashboard?.league.name ?? "TD Pool"}
      weekNumber={dashboard?.week.week ?? 0}
    >
      {children}
    </LeagueShell>
  );
}
