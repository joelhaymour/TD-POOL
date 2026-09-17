import Link from "next/link";
import { getStore } from "@/lib/store";
import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import { MemberChip } from "@/components/ui/result-mark";
import { ticketStandings, type TicketStanding } from "@/lib/tickets/standings";
import type { League } from "@/lib/types";

export type TicketRange = "week" | "season";

/**
 * Members ranked by tickets cashed — this week or the whole season. Net is
 * money out minus money in across settled tickets that carried a stake.
 */
export async function TicketLeaderboard({
  slug,
  league,
  viewerMemberId,
  range,
}: {
  slug: string;
  league: League;
  viewerMemberId: string;
  range: TicketRange;
}) {
  const store = getStore();
  const [tickets, members, weeks] = await Promise.all([
    store.listParlaysForLeague(league.id, "ticket"),
    store.listMembers(league.id),
    store.listWeeks(),
  ]);
  const week = weeks.find((w) => w.id === league.active_week_id);
  const standings = ticketStandings(tickets, members, {
    weekId: range === "week" ? (league.active_week_id ?? null) : null,
  });
  const anyPosted = standings.some((s) => s.posted > 0);
  const anySettled = standings.some((s) => s.won + s.lost > 0);
  const showMoney = league.betting_mode !== "none";
  const [first, second, third] = standings;

  const net = (row: TicketStanding) => row.returned - row.staked;
  const mostRidden = standings.reduce<TicketStanding | null>(
    (best, row) => (row.rides > 0 && (!best || row.rides > best.rides) ? row : best),
    null,
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          Leaderboard
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Tickets cashed ·{" "}
          {range === "week" ? `Week ${week?.week ?? "—"}` : "season to date"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-chalk p-1">
        {(
          [
            ["week", "This week"],
            ["season", "Season"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={`/${slug}/tickets/board${value === "season" ? "?range=season" : ""}`}
            className={cn(
              "flex h-9 items-center justify-center rounded-lg font-display text-xs font-bold uppercase tracking-wider transition",
              range === value ? "bg-lime text-accent-fg" : "text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {anySettled && first ? (
        <div className="grid grid-cols-3 items-end gap-2">
          <Podium row={second} place={2} />
          <Podium row={first} place={1} />
          <Podium row={third} place={3} />
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {standings.map((row, i) => (
          <li
            key={row.memberId}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5",
              row.memberId === viewerMemberId
                ? "border-lime/30 bg-lime/[0.07]"
                : "border-border bg-chalk",
            )}
          >
            <span className="w-4 shrink-0 font-display text-base font-extrabold text-ink-faint">
              {i + 1}
            </span>
            <MemberChip name={row.name} className="h-7 w-7 text-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {row.name}
                {row.memberId === viewerMemberId ? (
                  <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-lime">
                    You
                  </span>
                ) : null}
              </p>
              <p className="truncate text-[11px] text-ink-faint">
                {row.posted === 0
                  ? "Nothing posted"
                  : [
                      `${row.posted} posted`,
                      row.pending > 0 ? `${row.pending} live` : null,
                      row.bestHit ? `best ${formatAmerican(row.bestHit.odds)}` : null,
                      row.rides > 0 ? `${row.rides} ride${row.rides === 1 ? "" : "s"}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-lg font-extrabold leading-none text-ink">
                {row.won}-{row.lost}
              </p>
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  showMoney && row.staked > 0
                    ? net(row) >= 0
                      ? "text-lime"
                      : "text-danger"
                    : "text-ink-faint",
                )}
              >
                {showMoney && row.staked > 0
                  ? `${net(row) >= 0 ? "+" : "−"}${formatMoney(Math.abs(net(row)), league.currency)}`
                  : "—"}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {mostRidden ? (
        <div className="rounded-2xl border border-border bg-chalk p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
            Most ridden
          </p>
          <div className="mt-2 flex items-center gap-3">
            <MemberChip name={mostRidden.name} className="h-8 w-8 text-[10px]" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {mostRidden.name}
            </p>
            <span className="shrink-0 font-display text-xl font-extrabold text-lime">
              {mostRidden.rides}
            </span>
          </div>
        </div>
      ) : null}

      {!anyPosted ? (
        <p className="text-center text-xs text-ink-faint">
          Standings fill in as tickets are posted and settle.
        </p>
      ) : null}
    </div>
  );
}

/** One place on the podium; the leader's card is taller and lit. */
function Podium({ row, place }: { row: TicketStanding | undefined; place: number }) {
  if (!row) return <div />;
  const leader = place === 1;
  return (
    <div
      className={cn(
        "rounded-2xl border px-2 text-center",
        leader ? "border-lime/40 bg-lime/[0.1] py-4" : "border-border bg-chalk py-3",
      )}
    >
      <p
        className={cn(
          "font-display text-[11px] font-bold uppercase tracking-[0.1em]",
          leader ? "text-lime" : "text-ink-faint",
        )}
      >
        {leader ? "Leader" : place === 2 ? "2nd" : "3rd"}
      </p>
      <MemberChip
        name={row.name}
        className={cn(
          "mx-auto mt-2",
          leader ? "h-10 w-10 bg-lime text-[12px] text-accent-fg" : "h-8 w-8 text-[10px]",
        )}
      />
      <p className="mt-2 truncate text-xs font-semibold text-ink">{row.name}</p>
      <p
        className={cn(
          "mt-0.5 font-display text-xl font-extrabold leading-none",
          leader ? "text-lime" : "text-ink",
        )}
      >
        {row.won}-{row.lost}
      </p>
    </div>
  );
}
