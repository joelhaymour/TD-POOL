import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import type { SlipPhase } from "@/lib/props/slip";
import type { Currency } from "@/lib/types";

const PHASE: Record<SlipPhase, { label: string; className: string }> = {
  building: { label: "Building", className: "bg-raised-fg/10 text-raised-fg/75" },
  locked: { label: "Bet placed", className: "bg-raised-fg/15 text-raised-fg" },
  live: { label: "Live", className: "bg-lime text-accent-fg" },
  busted: { label: "Busted", className: "bg-danger text-white" },
  settled: { label: "Settled", className: "bg-raised-fg/15 text-raised-fg" },
};

function Stat({
  label,
  value,
  accent,
  onEdit,
}: {
  label: string;
  value: string;
  accent?: boolean;
  onEdit?: () => void;
}) {
  const body = (
    <>
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
        {label}
        {onEdit ? <Pencil className="h-2.5 w-2.5" aria-hidden /> : null}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate font-display text-2xl font-extrabold leading-none tracking-tight",
          accent ? "text-lime" : "text-raised-fg",
        )}
      >
        {value}
      </p>
    </>
  );
  return onEdit ? (
    <button
      type="button"
      className="min-w-0 text-left"
      onClick={onEdit}
      aria-label={`Edit ${label.toLowerCase()}`}
    >
      {body}
    </button>
  ) : (
    <div className="min-w-0">{body}</div>
  );
}

/** The group's slip at a glance — same shape as the TD Pool's weekly parlay card. */
export function SlipHero({
  weekNumber,
  title,
  phase,
  legsIn,
  capacity,
  american,
  stake,
  payout,
  showMoney,
  currency,
  onEditStake,
  actions,
  progress,
  children,
}: {
  weekNumber: number;
  title: string;
  phase: SlipPhase;
  legsIn: number;
  capacity: number;
  american: number | null;
  stake: number;
  payout: number | null;
  showMoney: boolean;
  currency: Currency;
  onEditStake?: () => void;
  actions?: ReactNode;
  /** Leg-by-leg progress bars, rendered under the count. */
  progress?: ReactNode;
  children?: ReactNode;
}) {
  const odds = american != null ? formatAmerican(american) : "—";
  return (
    <section className="relative overflow-hidden rounded-2xl bg-raised p-4 text-raised-fg shadow-card">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 90% -10%, rgba(184,242,74,0.35), transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(31,138,76,0.45), transparent 50%)",
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="line-clamp-2 font-display text-lg font-extrabold uppercase leading-tight tracking-[0.12em] text-lime">
              {title}
            </h2>
            <p className="text-xs font-medium text-raised-fg/60">Week {weekNumber}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                PHASE[phase].className,
              )}
            >
              {PHASE[phase].label}
            </span>
          </div>
        </div>

        <p className="mt-3 font-display text-4xl font-extrabold leading-none tracking-tight">
          {legsIn}
          <span className="text-raised-fg/40"> / {capacity}</span>
        </p>
        <p className="mt-1 text-xs font-medium text-raised-fg/65">Legs in</p>
        {progress ? <div className="mt-3">{progress}</div> : null}

        <div
          className={cn(
            "mt-4 grid gap-3 border-t border-raised-fg/10 pt-4",
            showMoney ? "grid-cols-3" : "grid-cols-1",
          )}
        >
          <Stat label="Est. odds" value={odds} accent />
          {showMoney ? (
            <>
              <Stat
                label="Stake"
                value={formatMoney(stake, currency)}
                onEdit={onEditStake}
              />
              <Stat
                label="Est. payout"
                value={
                  phase === "busted"
                    ? "—"
                    : payout != null
                      ? formatMoney(payout, currency)
                      : "—"
                }
              />
            </>
          ) : null}
        </div>

        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </section>
  );
}
