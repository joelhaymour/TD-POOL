import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import type { PickResult } from "@/lib/types";

export type ParlaySummaryProps = {
  weekNumber: number;
  /** One entry per member, in board order — drives the result bar. */
  pickResults?: PickResult[];
  picksSubmitted: number;
  totalMembers: number;
  /** Combined American odds estimate; null when incomplete or no money */
  estimatedAmericanOdds: number | null;
  stake: number | null;
  payout: number | null;
  showMoney?: boolean;
  currency?: "USD" | "CAD";
  oddsUpdatedAt?: string | null;
  oddsSource?: "live" | "mock" | "none";
  oddsNote?: string | null;
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
          accent ? "text-lime" : "text-raised-fg",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * One segment per member's pick — scored lime, missed red, still playing a
 * pulse, not yet decided dim. The parlay cards carry the same bar, so both
 * league types read the same way at a glance.
 */
function PickResults({ results }: { results: PickResult[] }) {
  if (results.length === 0) return null;
  return (
    <div className="mt-3 flex gap-1" aria-hidden>
      {results.map((result, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            result === "td" && "bg-lime",
            result === "no_td" && "bg-danger",
            result === "game_not_finished" && "animate-pulse bg-turf",
            result === "pending" && "bg-raised-fg/15",
          )}
        />
      ))}
    </div>
  );
}

export function ParlaySummary({
  weekNumber,
  pickResults = [],
  picksSubmitted,
  totalMembers,
  estimatedAmericanOdds,
  stake,
  payout,
  showMoney = true,
  currency = "USD",
  oddsUpdatedAt,
  oddsSource,
  oddsNote,
  className,
}: ParlaySummaryProps) {
  // A failed refresh now leaves the previous prices in place, so trust what is
  // actually on screen over the last sync's status: claiming "no sportsbook
  // odds" above a rendered price would be the more confusing of the two.
  const hasOdds = estimatedAmericanOdds != null;
  const oddsLabel = formatOddsAge(
    oddsUpdatedAt,
    hasOdds && oddsSource === "none" ? "live" : oddsSource,
    hasOdds ? null : oddsNote,
  );

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl bg-raised p-4 text-raised-fg shadow-card",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 90% -10%, rgba(17,128,60,0.12), transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(17,128,60,0.07), transparent 50%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold uppercase tracking-[0.12em] text-lime">
            Week {weekNumber} Parlay
          </h2>
          <span className="rounded-md bg-raised-fg/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-raised-fg/70">
            Estimates
          </span>
        </div>

        <p className="mt-3 font-display text-4xl font-extrabold leading-none tracking-tight">
          {picksSubmitted}
          <span className="text-raised-fg/40"> / {totalMembers}</span>
        </p>
        <p className="mt-1 text-xs font-medium text-raised-fg/65">
          Picks submitted
        </p>
        <PickResults results={pickResults} />

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
          <p className="mt-4 text-xs text-raised-fg/55">
            Money tracking is off for this league.
          </p>
        )}

        {oddsLabel ? (
          <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-raised-fg/45">
            {oddsLabel}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function formatOddsAge(
  iso: string | null | undefined,
  source?: "live" | "mock" | "none",
  note?: string | null,
): string | null {
  // A bare "unavailable" reads like a bug. Quota exhaustion and a missing key
  // need different fixes, so say which one happened.
  if (source === "none") {
    return note ? `No sportsbook odds — ${note}` : "No sportsbook odds available";
  }
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const mins = Math.max(0, Math.round(ms / 60_000));
  const age =
    mins < 1 ? "just now" : mins === 1 ? "1 min ago" : `${mins} min ago`;
  const src = source === "live" ? "live" : "mock";
  return `Odds updated ${age} · ${src}`;
}
