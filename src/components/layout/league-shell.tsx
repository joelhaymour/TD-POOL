"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LeagueHeader } from "@/components/layout/league-header";
import type { BottomNavItem } from "@/components/layout/bottom-nav";

export function LeagueShell({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const basePath = `/${slug}`;
  const [leagueName, setLeagueName] = useState("Loading…");
  const [weekNumber, setWeekNumber] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/leagues/${slug}`);
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
        // header stays in loading state
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const navItems: BottomNavItem[] = [
    { href: basePath, label: "Picks", icon: "picks" },
    { href: `${basePath}/bet-slip`, label: "Bet Slip", icon: "slip" },
    { href: `${basePath}/history`, label: "History", icon: "history" },
    { href: `${basePath}/admin`, label: "Admin", icon: "league" },
  ];

  return (
    <AppShell
      basePath={basePath}
      navItems={navItems}
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
