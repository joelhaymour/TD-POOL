import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";

export type LeagueHeaderProps = {
  leagueName: string;
  weekNumber: number;
  settingsHref: string;
  subtitle?: string;
  className?: string;
  /** Rendered under the name row — the section switcher. */
  children?: ReactNode;
};

export function LeagueHeader({
  leagueName,
  weekNumber,
  settingsHref,
  subtitle,
  className,
  children,
}: LeagueHeaderProps) {
  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* The only way out of a league once you are in one, for anybody who
              runs more than one pool. */}
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-turf hover:text-ink"
          >
            <ChevronLeft className="h-3 w-3" />
            All leagues
          </Link>
          <h1 className="font-display truncate text-2xl font-extrabold uppercase leading-tight tracking-wide text-ink">
            {leagueName}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge className={cn("bg-raised text-lime border-raised")}>
              NFL Week {weekNumber}
            </Badge>
            {subtitle ? (
              <span className="text-xs text-ink-muted">{subtitle}</span>
            ) : null}
          </div>
        </div>
        <Link
          href={settingsHref}
          aria-label="League settings"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-chalk text-ink-muted transition-colors hover:text-ink"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
      {children}
    </div>
  );
}
