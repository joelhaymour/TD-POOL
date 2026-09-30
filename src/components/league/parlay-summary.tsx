import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import type { PickResult } from "@/lib/types";

export type YourPick = {
  name: string;
  /** "RB · BAL vs CIN" */
  detail: string;
  odds: number | null;
  result: PickResult;
};

export type ParlaySummaryProps = {
  weekNumber: number;
  /** The viewer's own pick this week; null when they haven't made one. */
  yourPick: YourPick | null;
  picksLocked: boolean;
  /** Jump to the board to pick (or change) a player. */
  onChoose?: () => void;
  /** One entry per member, in board order — drives the result bar. */
  pickResults?: PickResult[];
  picksSubmitted: number;
  totalMembers: number;
  /** Combined American odds of the picks made so far; null before any priced pick. */
  estimatedAmericanOdds: number | null;
  /** Picks left out of the odds because they have no price. */
  unpricedPicks?: number;
  stake: number | null;
  payout: number | null;
  showMoney?: boolean;
  currency?: "USD" | "CAD";
  oddsUpdatedAt?: string | null;
  oddsSource?: "live" | "mock" | "none";
  oddsNote?: string | null;
  className?: string;
};

/**
 * One segment per member's pick — scored green, missed red, still playing a
 * pulse, not yet decided dim.
 */
function PickResults({ results }: { results: PickResult[] }) {
  if (results.length === 0) return null;
  return (
    <div className="mt-2.5 flex gap-1" aria-hidden>
      {results.map((result, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            result === "td" && "bg-lime",
            result === "no_td" && "bg-danger",
            result === "game_not_finished" && "animate-pulse bg-ink/35",
            result === "pending" && "bg-ink/10",
          )}
        />
      ))}
    </div>
  );
}

const RESULT_LABEL: Record<PickResult, string> = {
  pending: "Game not started",
  game_not_finished: "Playing now",
  td: "Scored",
  no_td: "No TD",
};

/**
 * The top of the TD Pool screen: your pick for the week is the headline, and
 * the league's parlay sits underneath it in one quiet block.
 */
export function ParlaySummary({
  weekNumber,
  yourPick,
  picksLocked,
  onChoose,
  pickResults = [],
  picksSubmitted,
  totalMembers,
  estimatedAmericanOdds,
  unpricedPicks = 0,
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

  const hits = pickResults.filter((r) => r === "td").length;
  const misses = pickResults.filter((r) => r === "no_td").length;
  const live = pickResults.filter((r) => r === "game_not_finished").length;
  const decided = hits + misses > 0 || live > 0;
  const allIn = picksSubmitted > 0 && picksSubmitted === totalMembers;
  const parlayWon = allIn && hits === totalMembers;
  const parlayLost = misses > 0;

  return (
    <section className={cn("rounded-[1.4rem] bg-chalk p-4 shadow-card", className)}>
      <p className="text-[13px] font-medium text-ink-muted">Week {weekNumber} · Your pick</p>

      {yourPick ? (
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[26px] font-bold leading-tight tracking-tight text-ink">
              {yourPick.name}
            </p>
            <p className="mt-0.5 truncate text-sm text-ink-muted">
              {yourPick.detail}
              {yourPick.odds != null ? (
                <>
                  {" · "}
                  <span className="font-display text-base font-bold text-ink">
                    {formatAmerican(yourPick.odds)}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
              yourPick.result === "td"
                ? "bg-lime text-accent-fg"
                : yourPick.result === "no_td"
                  ? "bg-danger/10 text-danger"
                  : "bg-ink/[0.06] text-ink-muted",
            )}
          >
            {RESULT_LABEL[yourPick.result]}
          </span>
        </div>
      ) : (
        <p className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-ink">No pick yet</p>
      )}

      {!picksLocked && onChoose ? (
        yourPick ? (
          <button
            type="button"
            onClick={onChoose}
            className="mt-2 text-sm font-semibold text-ink-muted underline decoration-ink/20 underline-offset-4"
          >
            Change pick
          </button>
        ) : (
          <Button fullWidth size="lg" className="mt-3" onClick={onChoose}>
            Choose a player
          </Button>
        )
      ) : picksLocked && !yourPick ? (
        <p className="mt-1 text-sm text-ink-muted">Picks are locked for this week.</p>
      ) : null}

      <div className="mt-4 border-t border-ink/[0.07] pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold text-ink">
            {parlayWon ? "League parlay hit" : parlayLost ? "League parlay lost" : "League parlay"}
          </p>
          <p className="text-[13px] text-ink-muted">
            {decided
              ? `${hits} of ${picksSubmitted} scored${live ? ` · ${live} playing` : ""}`
              : `${picksSubmitted} of ${totalMembers} in`}
          </p>
        </div>
        <PickResults results={pickResults} />
        {picksSubmitted === 0 ? (
          <p className="mt-2.5 text-[13px] text-ink-muted">The odds and pot build as picks come in.</p>
        ) : showMoney ? (
          <p className="mt-2.5 text-[13px] text-ink-muted">
            {hasOdds ? (
              <>
                <span className="font-display text-[15px] font-bold text-ink">
                  {formatAmerican(estimatedAmericanOdds)}
                </span>
                {picksSubmitted < totalMembers ? " so far" : ""}
              </>
            ) : (
              "No odds for these picks yet"
            )}
            {hasOdds && stake != null && stake > 0 ? (
              <>
                {" · "}
                <span className="font-display text-[15px] font-bold text-ink">{formatMoney(stake, currency)}</span>
                {payout != null ? (
                  <>
                    {" to win "}
                    <span className="font-display text-[15px] font-bold text-ink">
                      {formatMoney(payout, currency)}
                    </span>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        ) : null}
        {oddsLabel ? (
          <p suppressHydrationWarning className="mt-1 text-[11px] text-ink-faint">
            {oddsLabel} · estimates
            {unpricedPicks > 0
              ? ` · ${unpricedPicks} pick${unpricedPicks === 1 ? "" : "s"} without odds left out`
              : ""}
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
