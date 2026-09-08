"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LeagueHeader } from "@/components/layout/league-header";
import { leagueNavItems } from "@/components/layout/bottom-nav";

export function LeagueShell({
  slug,
  leagueName: initialName,
  weekNumber: initialWeek,
  children,
}: {
  slug: string;
  leagueName: string;
  weekNumber: number;
  children: ReactNode;
}) {
  const basePath = `/${slug}`;
  const [leagueName, setLeagueName] = useState(initialName);
  const [weekNumber, setWeekNumber] = useState(initialWeek);

  useEffect(() => {
    setLeagueName(initialName);
    setWeekNumber(initialWeek);
  }, [initialName, initialWeek]);

  // Name and week come from the server render. Re-fetching the whole dashboard
  // here just to read two fields tripled the work of every page load.

  return (
    <AppShell
      basePath={basePath}
      navItems={leagueNavItems(basePath)}
      header={
        <LeagueHeader
          leagueName={leagueName}
          weekNumber={weekNumber || 1}
          settingsHref={`${basePath}/settings`}
        />
      }
    >
      {children}
    </AppShell>
  );
}
