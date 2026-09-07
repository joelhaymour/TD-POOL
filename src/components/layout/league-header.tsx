import Link from "next/link";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";

export type LeagueHeaderProps = {
  leagueName: string;
  weekNumber: number;
  settingsHref: string;
  subtitle?: string;
  className?: string;
};

export function LeagueHeader({
  leagueName,
  weekNumber,
  settingsHref,
  subtitle,
  className,
}: LeagueHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-turf">
          Anytime TD Pool
        </p>
        <h1 className="font-display truncate text-2xl font-extrabold uppercase leading-tight tracking-wide text-ink">
          {leagueName}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge className="bg-ink text-lime border-ink">
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
  );
}
