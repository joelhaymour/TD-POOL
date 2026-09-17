import { cn } from "@/lib/utils/cn";
import { isAlternateMarket } from "@/lib/props/markets";
import { legUnit } from "@/lib/props/format";
import type { ParlayLeg } from "@/lib/types";

/** Markets with no number that climbs toward a line, so a bar means nothing. */
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

/**
 * Stats that come one at a time — catches, touchdowns, sacks, field goals —
 * are drawn as a box per unit, so "over 6.5" reads as seven boxes with the
 * ones he has lit. Yards and points are a smooth fill; so is any count with
 * more boxes than fit on a phone.
 */
const ONE_AT_A_TIME = new Set([
  "player_receptions",
  "player_pass_tds",
  "player_rush_tds",
  "player_reception_tds",
  "player_rush_reception_tds",
  "player_pass_rush_reception_tds",
  "player_tds_over",
  "player_field_goals",
  "player_pats",
  "player_sacks",
  "player_pass_interceptions",
  "player_defensive_interceptions",
  "player_solo_tackles",
  "player_tackles_assists",
  "player_assists",
]);
const MAX_BOXES = 12;

type ProgressLeg = Pick<
  ParlayLeg,
  "market_key" | "outcome_label" | "line" | "actual_value" | "result"
>;

/** Shown from the moment the leg exists: empty before kickoff, filling after. */
export function hasLineProgress(leg: ProgressLeg): boolean {
  return leg.line != null && leg.line > 0 && !NOT_A_COUNT.has(leg.market_key);
}

/** Boxes needed to clear the line: over 6.5 → 7, a 5+ ladder → 5. */
function boxesFor(leg: ProgressLeg): number | null {
  const base = leg.market_key.replace(/_alternate$/, "");
  if (!ONE_AT_A_TIME.has(base)) return null;
  const boxes = isAlternateMarket(leg.market_key)
    ? Math.ceil(leg.line!)
    : Math.floor(leg.line!) + 1;
  return boxes >= 1 && boxes <= MAX_BOXES ? boxes : null;
}

/**
 * How close a leg is to its line.
 *
 * An over fills toward the number and turns lime the moment it clears; an
 * under fills the other way — the closer the number creeps to the line, the
 * more the bar warns, because for an under, climbing is bad. Before the
 * game there is nothing to fill, so the bar sits dim with its target.
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
  const started = leg.actual_value != null;
  const actual = leg.actual_value ?? 0;
  const under = leg.outcome_label.trim().toLowerCase() === "under";
  const cleared =
    started && (isAlternateMarket(leg.market_key) ? actual >= line : actual > line);
  const unit = legUnit(leg.market_key);
  const boxes = boxesFor(leg);

  const fill = under
    ? cleared
      ? "bg-danger"
      : actual / line > 0.8
        ? "bg-warning"
        : "bg-turf"
    : cleared
      ? "bg-lime"
      : "bg-turf";

  return (
    <div className={cn("flex items-center gap-2", !started && "opacity-60", className)}>
      {boxes != null ? (
        <div className="flex flex-1 gap-[3px]" aria-hidden>
          {Array.from({ length: boxes }, (_, i) => {
            // A half sack lights half a box.
            const part = Math.max(0, Math.min(1, actual - i));
            return (
              <span
                key={i}
                className="h-1.5 flex-1 overflow-hidden rounded-[2px] bg-ink/12"
              >
                <span
                  className={cn("block h-full", fill)}
                  style={{ width: `${Math.round(part * 100)}%` }}
                />
              </span>
            );
          })}
        </div>
      ) : (
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/12" aria-hidden>
          <div
            className={cn("h-full rounded-full transition-[width]", fill)}
            style={{ width: `${Math.round(Math.max(0, Math.min(1, actual / line)) * 100)}%` }}
          />
        </div>
      )}
      <span
        className={cn(
          "shrink-0 font-display text-[11px] font-bold tabular-nums",
          cleared && !under ? "text-lime" : "text-ink-faint",
        )}
      >
        {started ? actual : "–"}
        <span className="text-ink-faint">
          /{line}
          {unit ? ` ${unit}` : ""}
        </span>
      </span>
    </div>
  );
}
