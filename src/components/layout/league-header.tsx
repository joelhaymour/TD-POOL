import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, Settings } from "lucide-react";

export type LeagueHeaderProps = {
  leagueName: string;
  weekNumber: number;
  settingsHref: string;
  subtitle?: string;
  className?: string;
  /** Extra buttons beside settings (the notifications bell). */
  actions?: ReactNode;
  /** Rendered under the name row — the section switcher. */
  children?: ReactNode;
};

const squareButton =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-chalk text-ink transition active:scale-95 hover:border-border-strong";

export function LeagueHeader({
  leagueName,
  weekNumber,
  settingsHref,
  subtitle,
  className,
  actions,
  children,
}: LeagueHeaderProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        {/* The way back to every league: a full-size button, not a caption. */}
        <Link href="/" aria-label="All leagues" className={squareButton}>
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-extrabold uppercase leading-tight tracking-wide text-ink">
            {leagueName}
          </h1>
          <p className="truncate text-xs text-ink-muted">
            <span className="font-semibold text-turf">Week {weekNumber}</span>
            {subtitle ? <> · {subtitle}</> : null}
          </p>
        </div>
        {actions}
        <Link href={settingsHref} aria-label="League settings" className={`${squareButton} text-ink-muted`}>
          <Settings className="h-5 w-5" />
        </Link>
      </div>
      {children}
    </div>
  );
}
