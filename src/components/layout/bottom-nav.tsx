"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  History,
  Layers,
  Ticket,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type BottomNavItem = {
  href: string;
  label: string;
  icon: "picks" | "league" | "slip" | "history" | "board";
  badge?: number;
};

export type BottomNavProps = {
  basePath: string;
  items?: BottomNavItem[];
  className?: string;
};

const iconMap = {
  picks: Layers,
  league: ClipboardList,
  slip: Ticket,
  history: History,
  board: Trophy,
};

/** Single source of truth for league bottom nav (avoids SSR/client label drift). */
export function leagueNavItems(basePath: string): BottomNavItem[] {
  return [
    { href: basePath, label: "Picks", icon: "picks" },
    { href: `${basePath}/bet-slip`, label: "Slip", icon: "slip" },
    { href: `${basePath}/history`, label: "History", icon: "history" },
    { href: `${basePath}/leaderboard`, label: "Board", icon: "board" },
  ];
}

export function BottomNav({
  basePath,
  items,
  className,
}: BottomNavProps) {
  const pathname = usePathname();
  const navItems = items ?? leagueNavItems(basePath);

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-chalk/95 backdrop-blur-md",
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
      aria-label="Primary"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {navItems.map((item) => {
          const Icon = iconMap[item.icon];
          const active =
            pathname === item.href ||
            (item.href !== basePath && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-1 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                active ? "text-turf" : "text-ink-faint hover:text-ink-muted",
              )}
            >
              <span className="relative">
                <Icon
                  className={cn("h-5 w-5", active && "stroke-[2.25]")}
                  aria-hidden
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 font-display text-[10px] font-bold text-ink">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </span>
              {item.label}
              {active ? (
                <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-lime" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
