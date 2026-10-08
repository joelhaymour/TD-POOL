import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LeagueHeader } from "@/components/layout/league-header";
import { NotificationBell } from "@/components/notify/bell";
import { LeagueNav } from "@/components/layout/bottom-nav";
import { SectionSwitcher } from "@/components/layout/section-switcher";
import { leagueSectionNavs } from "@/components/layout/nav-items";
import { enabledSections } from "@/lib/league/sections";
import type { League } from "@/lib/types";

// Name, week and viewer all come from the server render. Re-fetching the
// dashboard here just to read them tripled the work of every page load.
export function LeagueShell({
  slug,
  league,
  weekNumber,
  viewerName,
  children,
}: {
  slug: string;
  league: Pick<League, "name" | "sections">;
  weekNumber: number;
  viewerName: string;
  children: ReactNode;
}) {
  const basePath = `/${slug}`;
  const navs = leagueSectionNavs(slug, league);

  return (
    <AppShell
      basePath={basePath}
      nav={<LeagueNav slug={slug} navs={navs} />}
      header={
        <LeagueHeader
          leagueName={league.name}
          weekNumber={weekNumber || 1}
          subtitle={viewerName}
          settingsHref={`${basePath}/settings`}
          actions={<NotificationBell />}
        >
          <SectionSwitcher
            slug={slug}
            sections={enabledSections(league).map((s) => ({
              path: s.path,
              label: s.label,
            }))}
          />
        </LeagueHeader>
      }
    >
      {children}
    </AppShell>
  );
}
