"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, History, Layers } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  leagueNavItems,
  type BottomNavItem,
} from "@/components/layout/nav-items";

export type BottomNavProps = {
  basePath: string;
  items?: BottomNavItem[];
  className?: string;
};

type IconProps = { className?: string };

/** Drawn to match the app's own line weight rather than a stock icon set. */
function CreateIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function TicketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 9a2 2 0 0 0 2-2V6h14v1a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2v1H5v-1a2 2 0 0 0-2-2z" />
      <path d="M9 10v4" />
    </svg>
  );
}

function TrophyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
      <path d="M12 14v4M9 20h6" />
    </svg>
  );
}

const iconMap = {
  picks: Layers,
  create: CreateIcon,
  league: ClipboardList,
  slip: TicketIcon,
  history: History,
  board: TrophyIcon,
};

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
      <div
        className="mx-auto grid max-w-lg"
        style={{
          gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
        }}
      >
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
                <Icon className={cn("h-5 w-5", active && "stroke-[2.25]")} />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 font-display text-[10px] font-bold text-accent-fg">
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
