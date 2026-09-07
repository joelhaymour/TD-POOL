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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/leagues/${slug}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          league: { name: string };
          week: { week: number };
        };
        if (!cancelled) {
          setLeagueName(data.league.name);
          setWeekNumber(data.week.week);
        }
      } catch {
        // keep SSR values
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <AppShell
      basePath={basePath}
      navItems={leagueNavItems(basePath)}
      header={
        <LeagueHeader
          leagueName={leagueName}
          weekNumber={weekNumber || 4}
          settingsHref={`${basePath}/settings`}
        />
      }
    >
      {children}
    </AppShell>
  );
}
