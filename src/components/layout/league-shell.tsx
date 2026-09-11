import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LeagueHeader } from "@/components/layout/league-header";
import {
  groupBettingNavItems,
  leagueNavItems,
} from "@/components/layout/nav-items";

// Name, week and viewer all come from the server render. Re-fetching the
// dashboard here just to read them tripled the work of every page load.
export function LeagueShell({
  slug,
  leagueName,
  weekNumber,
  viewerName,
  groupBetting = false,
  children,
}: {
  slug: string;
  leagueName: string;
  weekNumber: number;
  viewerName: string;
  groupBetting?: boolean;
  children: ReactNode;
}) {
  const basePath = `/${slug}`;

  return (
    <AppShell
      basePath={basePath}
      navItems={
        groupBetting ? groupBettingNavItems(basePath) : leagueNavItems(basePath)
      }
      header={
        <LeagueHeader
          leagueName={leagueName}
          weekNumber={weekNumber || 1}
          subtitle={viewerName}
          settingsHref={`${basePath}/settings`}
        />
      }
    >
      {children}
    </AppShell>
  );
}
