import { getStore } from "@/lib/store";
import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import { actualLabel, gameLabel, legPrice, legTitle } from "@/lib/props/format";
import { BookBadge } from "@/components/tickets/book-badge";
import { MemberChip, ResultMark } from "@/components/ui/result-mark";
import type { League, ParlayResult } from "@/lib/types";

const RESULT_BADGE: Record<ParlayResult, { label: string; className: string }> = {
  won: { label: "Won", className: "bg-lime text-accent-fg border-lime" },
  lost: { label: "Lost", className: "bg-ink/6 text-ink-muted border-border" },
  push: { label: "Push", className: "bg-field-deep text-ink-muted border-border" },
  pending: { label: "Pending", className: "bg-field-deep text-ink-muted border-border" },
};

/** Every settled ticket, newest first, with each leg's graded stat. */
export async function TicketHistory({
  league,
  viewerMemberId,
}: {
  league: League;
  viewerMemberId: string;
}) {
  const store = getStore();
  const [tickets, weeks, members] = await Promise.all([
    store.listParlaysForLeague(league.id, "ticket"),
    store.listWeeks(),
    store.listMembers(league.id),
  ]);
  const settled = tickets
    .filter((t) => t.parlay.settled_at)
    .sort(
      (a, b) => Date.parse(b.parlay.settled_at!) - Date.parse(a.parlay.settled_at!),
    );
  const games = await store.listGamesByIds([
    ...new Set(settled.flatMap((t) => t.legs.map((l) => l.game_id))),
  ]);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const nameOf = (id: string | null) =>
    members.find((m) => m.id === id)?.display_name ?? "Former member";
  const showMoney = league.betting_mode !== "none";

  const wins = settled.filter((t) => t.parlay.result === "won").length;
  const losses = settled.filter((t) => t.parlay.result === "lost").length;
  const priced = settled.filter((t) => t.parlay.stake != null);
  const staked = priced.reduce((sum, t) => sum + (t.parlay.stake ?? 0), 0);
  const returned = priced.reduce((sum, t) => sum + (t.parlay.payout ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          Ticket history
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Tickets land here once every game on them is final.
        </p>
      </div>

      {settled.length > 0 ? (
        <section className="grid grid-cols-2 gap-3 rounded-2xl bg-raised p-4 text-raised-fg shadow-card">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
              League record
            </p>
            <p className="mt-0.5 font-display text-2xl font-extrabold text-lime">
              {wins}-{losses}
            </p>
          </div>
          {showMoney && priced.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
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
          No settled tickets yet.
        </p>
      )}

      {settled.map(({ parlay, legs }) => {
        const badge = RESULT_BADGE[parlay.result];
        const hits = legs.filter((l) => l.result === "won").length;
        const graded = legs.filter((l) => l.result === "won" || l.result === "lost").length;
        const week = weekById.get(parlay.week_id);
        const who = nameOf(parlay.created_by_member_id);
        const mine = parlay.created_by_member_id === viewerMemberId;
        return (
          <section
            key={parlay.id}
            className="overflow-hidden rounded-2xl border border-border bg-chalk shadow-card"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border bg-field px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MemberChip
                    name={who}
                    className={mine ? "bg-lime/20 text-lime" : undefined}
                  />
                  <h3 className="truncate font-display text-base font-bold uppercase tracking-wide text-ink">
                    {who}
                  </h3>
                  <BookBadge book={parlay.sportsbook} />
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {week?.label ?? (week ? `Week ${week.week}` : "")}
                  {` · ${legs.length === 1 ? "single" : `${legs.length}-leg parlay`}`}
                  {` · ${hits}/${graded} hit`}
                  {parlay.book_odds != null ? ` · ${formatAmerican(parlay.book_odds)}` : ""}
                  {showMoney && parlay.stake != null
                    ? ` · ${formatMoney(parlay.stake, league.currency)}${
                        parlay.result === "won" && parlay.payout != null
                          ? ` → ${formatMoney(parlay.payout, league.currency)}`
                          : ""
                      }`
                    : ""}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
                  badge.className,
                )}
              >
                {badge.label}
              </span>
            </div>
            <ul className="flex flex-col gap-2 px-4 pb-4 pt-3">
              {legs.map((leg) => {
                const actual = actualLabel(leg);
                const price = legPrice(leg.american_odds);
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
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {legTitle(leg)}
                      </p>
                      <p className="truncate text-[11px] uppercase tracking-wide text-ink-faint">
                        {[leg.market_label, gameLabel(gamesById.get(leg.game_id)), actual]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {price ? (
                      <span className="shrink-0 font-display text-sm font-bold text-ink">
                        {price}
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
