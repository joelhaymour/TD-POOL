import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";

export type ParlaySummaryProps = {
  weekNumber: number;
  picksSubmitted: number;
  totalMembers: number;
  /** Combined American odds estimate; null when incomplete or no money */
  estimatedAmericanOdds: number | null;
  stake: number | null;
  payout: number | null;
  showMoney?: boolean;
  currency?: "USD" | "CAD";
  className?: string;
};

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-display text-2xl font-extrabold leading-none tracking-tight",
          accent ? "text-lime" : "text-chalk",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ParlaySummary({
  weekNumber,
  picksSubmitted,
  totalMembers,
  estimatedAmericanOdds,
  stake,
  payout,
  showMoney = true,
  currency = "USD",
  className,
}: ParlaySummaryProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl bg-ink p-4 text-chalk shadow-card",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 90% -10%, rgba(184,242,74,0.35), transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(31,138,76,0.45), transparent 50%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold uppercase tracking-[0.12em] text-lime">
            Week {weekNumber} Parlay
          </h2>
          <span className="rounded-md bg-chalk/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-chalk/70">
            Estimates
          </span>
        </div>

        <p className="mt-3 font-display text-4xl font-extrabold leading-none tracking-tight">
          {picksSubmitted}
          <span className="text-chalk/40"> / {totalMembers}</span>
        </p>
        <p className="mt-1 text-xs font-medium text-chalk/65">
          Picks submitted
        </p>

        {showMoney ? (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-chalk/10 pt-4">
            <Stat
              label="Est. odds"
              value={
                estimatedAmericanOdds != null
                  ? formatAmerican(estimatedAmericanOdds)
                  : "—"
              }
              accent
            />
            <Stat
              label="Stake"
              value={stake != null ? formatMoney(stake, currency) : "—"}
            />
            <Stat
              label="Est. payout"
              value={payout != null ? formatMoney(payout, currency) : "—"}
            />
          </div>
        ) : (
          <p className="mt-4 text-xs text-chalk/55">
            Money tracking is off for this league.
          </p>
        )}
      </div>
    </section>
  );
}
