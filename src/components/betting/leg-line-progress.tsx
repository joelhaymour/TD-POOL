import { cn } from "@/lib/utils/cn";
import { isAlternateMarket } from "@/lib/props/markets";
import type { ParlayLeg } from "@/lib/types";

/** Markets whose number climbs toward a line, so a bar means something. */
const NOT_A_COUNT = new Set([
  "h2h",
  "h2h_h1",
  "h2h_q1",
  "spreads",
  "spreads_h1",
  "spreads_q1",
  "alternate_spreads",
  "player_1st_td",
  "player_last_td",
  "player_anytime_td",
]);

type ProgressLeg = Pick<
  ParlayLeg,
  "market_key" | "outcome_label" | "line" | "actual_value" | "result"
>;

export function hasLineProgress(leg: ProgressLeg): boolean {
  return (
    leg.line != null &&
    leg.line > 0 &&
    leg.actual_value != null &&
    !NOT_A_COUNT.has(leg.market_key)
  );
}

/**
 * How close a leg is to its line, while its game is going.
 *
 * An over fills toward the number and turns lime the moment it clears; an
 * under fills the other way — the closer the number creeps to the line, the
 * more the bar warns, because for an under, climbing is bad.
 */
export function LegLineProgress({
  leg,
  className,
}: {
  leg: ProgressLeg;
  className?: string;
}) {
  if (!hasLineProgress(leg)) return null;

  const line = leg.line!;
  const actual = leg.actual_value!;
  const pct = Math.max(0, Math.min(1, actual / line));
  const under = leg.outcome_label.trim().toLowerCase() === "under";
  const cleared = isAlternateMarket(leg.market_key)
    ? actual >= line
    : actual > line;

  const fill = under
    ? cleared
      ? "bg-danger"
      : pct > 0.8
        ? "bg-warning"
        : "bg-turf"
    : cleared
      ? "bg-lime"
      : "bg-turf";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/12">
        <div
          className={cn("h-full rounded-full transition-[width]", fill)}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <span
        className={cn(
          "shrink-0 font-display text-[11px] font-bold tabular-nums",
          cleared && !under ? "text-lime" : "text-ink-faint",
        )}
      >
        {actual}
        <span className="text-ink-faint">/{line}</span>
      </span>
    </div>
  );
}
