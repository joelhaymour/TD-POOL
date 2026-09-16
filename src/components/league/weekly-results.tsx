import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/odds";
import type { PickResult } from "@/lib/types";

export type WeeklyResultRow = {
  memberId: string;
  memberName: string;
  playerName: string | null;
  result: PickResult;
};

export function WeeklyResults({
  members,
  picksSubmitted,
  totalMembers,
  stake,
  payout,
  currency = "USD",
  showMoney = true,
  className,
}: {
  members: WeeklyResultRow[];
  picksSubmitted: number;
  totalMembers: number;
  stake: number | null;
  payout: number | null;
  currency?: "USD" | "CAD";
  showMoney?: boolean;
  className?: string;
}) {
  const withPicks = members.filter((m) => m.playerName);
  const hits = withPicks.filter((m) => m.result === "td").length;
  const misses = withPicks.filter((m) => m.result === "no_td").length;
  const pending = withPicks.filter(
    (m) => m.result === "pending" || m.result === "game_not_finished",
  ).length;
  const decided = hits + misses;
  const allDecided = withPicks.length > 0 && pending === 0 && decided === withPicks.length;
  const parlayHit = allDecided && hits === withPicks.length && withPicks.length > 0;
  const parlayLost = allDecided && misses > 0;

  if (withPicks.length === 0) return null;

  const showResults =
    hits > 0 || misses > 0 || allDecided || pending < withPicks.length;

  if (!showResults && pending === withPicks.length) {
    return null;
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-chalk p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
            Parlay status
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold uppercase tracking-wide text-ink">
            {hits} / {withPicks.length || picksSubmitted} hit
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {pending > 0
              ? `${pending} game${pending === 1 ? "" : "s"} still open`
              : `${totalMembers - picksSubmitted} members without a pick`}
          </p>
        </div>
        <div className="text-right">
          {parlayHit ? (
            <p className="font-display text-lg font-extrabold uppercase text-turf">
              Parlay hit
            </p>
          ) : parlayLost ? (
            <p className="font-display text-lg font-extrabold uppercase text-danger">
              Parlay lost
            </p>
          ) : (
            <p className="font-display text-lg font-extrabold uppercase text-ink-muted">
              In progress
            </p>
          )}
          {showMoney && parlayHit && payout != null ? (
            <p className="mt-1 text-sm font-semibold text-ink">
              {formatMoney(payout, currency)}
              {stake != null ? (
                <span className="font-normal text-ink-muted">
                  {" "}
                  on {formatMoney(stake, currency)}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-border border-t border-border">
        {withPicks.map((m) => (
          <li
            key={m.memberId}
            className="flex items-center justify-between gap-3 py-2.5 text-sm"
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink">{m.memberName}</p>
              <p className="truncate text-ink-muted">{m.playerName}</p>
            </div>
            <ResultBadge result={m.result} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultBadge({ result }: { result: PickResult }) {
  if (result === "td") {
    return (
      <span className="shrink-0 rounded-md bg-turf/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-turf">
        TD
      </span>
    );
  }
  if (result === "no_td") {
    return (
      <span className="shrink-0 rounded-md bg-danger/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-danger">
        No TD
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-md bg-ink/5 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
      ⏳ Pending
    </span>
  );
}
