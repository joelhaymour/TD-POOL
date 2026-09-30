import { getStore } from "@/lib/store";
import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import { slipEstimate, slipStake } from "@/lib/props/slip";
import { actualLabel, gameLabel, legPrice, legTitle } from "@/lib/props/format";
import { MemberChip, ResultMark } from "@/components/ui/result-mark";
import type { League, ParlayResult } from "@/lib/types";

const RESULT_BADGE: Record<ParlayResult, { label: string; className: string }> = {
  won: { label: "Won", className: "bg-lime text-accent-fg border-lime" },
  lost: { label: "Lost", className: "bg-ink/6 text-ink-muted border-border" },
  push: { label: "Push", className: "bg-field-deep text-ink-muted border-border" },
  pending: { label: "Pending", className: "bg-field-deep text-ink-muted border-border" },
};

/** Settled slips, newest first, with every leg's graded stat. */
export async function GroupHistory({
  league,
  viewerMemberId,
}: {
  league: League;
  viewerMemberId: string;
}) {
  const store = getStore();
  const [slips, weeks, members] = await Promise.all([
    store.listParlaysForLeague(league.id, "group"),
    store.listWeeks(),
    store.listMembers(league.id),
  ]);
  const settled = slips
    .filter((s) => s.parlay.settled_at)
    .sort(
      (a, b) =>
        Date.parse(b.parlay.settled_at!) - Date.parse(a.parlay.settled_at!),
    );
  const games = await store.listGamesByIds([
    ...new Set(settled.flatMap((s) => s.legs.map((l) => l.game_id))),
  ]);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? "Former member";
  const showMoney = league.betting_mode !== "none";

  const wins = settled.filter((s) => s.parlay.result === "won").length;
  const losses = settled.filter((s) => s.parlay.result === "lost").length;
  const staked = settled.reduce((sum, s) => sum + slipStake(s.parlay, league), 0);
  const returned = settled.reduce((sum, s) => sum + (s.parlay.payout ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink tracking-tight">
          Season history
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Slips land here once every game on them is final.
        </p>
      </div>

      {settled.length > 0 ? (
        <section className="grid grid-cols-2 gap-3 rounded-2xl bg-raised p-4 text-raised-fg shadow-card">
          <div>
            <p className="text-[11px] font-semibold text-ink-faint">
              Slip record
            </p>
            <p className="mt-0.5 font-display text-2xl font-extrabold text-lime">
              {wins}-{losses}
            </p>
          </div>
          {showMoney ? (
            <div>
              <p className="text-[11px] font-semibold text-ink-faint">
                Net
              </p>
              <p className="mt-0.5 font-display text-2xl font-extrabold">
                {returned - staked >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(returned - staked), league.currency)}
              </p>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-border-strong bg-chalk/60 px-4 py-10 text-center text-sm text-ink-muted">
          No settled slips yet.
        </p>
      )}

      {settled.map(({ parlay, legs }) => {
        const stake = slipStake(parlay, league);
        const odds = slipEstimate(legs, stake).american;
        const badge = RESULT_BADGE[parlay.result];
        const hits = legs.filter((l) => l.result === "won").length;
        const graded = legs.filter((l) => l.result === "won" || l.result === "lost").length;
        const weekLabel = weekById.get(parlay.week_id);
        return (
          <section
            key={parlay.id}
            className="overflow-hidden rounded-[1.4rem] bg-chalk shadow-card"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border bg-field px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-semibold text-ink">
                  {parlay.title}
                </h3>
                <p className="text-xs text-ink-muted">
                  {weekLabel?.label ?? (weekLabel ? `Week ${weekLabel.week}` : "")}
                  {` · ${hits}/${graded} hit`}
                  {odds != null ? ` · ${formatAmerican(odds)}` : ""}
                  {showMoney && parlay.result === "won" && parlay.payout != null
                    ? ` · ${formatMoney(stake, league.currency)} → ${formatMoney(parlay.payout, league.currency)}`
                    : ""}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                  badge.className,
                )}
              >
                {badge.label}
              </span>
            </div>
            <ul className="flex flex-col gap-2 px-4 pb-4">
              {legs.map((leg) => {
                const actual = actualLabel(leg);
                const who = nameOf(leg.member_id);
                const mine = leg.member_id === viewerMemberId;
                return (
                  <li
                    key={leg.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5",
                      leg.result === "won"
                        ? "border-lime/30 bg-lime/[0.07]"
                        : leg.result === "lost"
                          ? "border-danger/25 bg-danger/[0.06]"
                          : "border-border bg-chalk",
                    )}
                  >
                    <span className="flex w-5 shrink-0 justify-center">
                      <ResultMark result={leg.result} />
                    </span>
                    {who ? (
                      <MemberChip
                        name={who}
                        className={mine ? "bg-lime/20 text-lime" : undefined}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {legTitle(leg)}
                      </p>
                      <p className="truncate text-[11px] text-ink-faint">
                        {[leg.market_label, gameLabel(gamesById.get(leg.game_id)), actual]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {legPrice(leg.american_odds) ? (
                      <span className="shrink-0 font-display text-sm font-bold text-ink">
                        {legPrice(leg.american_odds)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
