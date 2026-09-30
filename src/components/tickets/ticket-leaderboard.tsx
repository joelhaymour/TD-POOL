import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { gameStarted } from "@/lib/props/slip";
import { getStore } from "@/lib/store";
import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import { MemberChip } from "@/components/ui/result-mark";
import { Segmented } from "@/components/ui/segmented";
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
  weekNumber,
}: {
  slug: string;
  league: League;
  viewerMemberId: string;
  range: TicketRange;
  /** A week picked with the arrows; otherwise the latest week played. */
  weekNumber?: number;
}) {
  const store = getStore();
  const [tickets, members, weeks] = await Promise.all([
    store.listParlaysForLeague(league.id, "ticket"),
    store.listMembers(league.id),
    store.listWeeks(),
  ]);

  // The league's active week moves on as soon as a week's games are over,
  // which is exactly when its tickets settle. So "this week" means the most
  // recent week whose tickets have kicked off, not the active week.
  const active = weeks.find((w) => w.id === league.active_week_id);
  const season = active?.season;
  const games = await store.listGamesByIds([
    ...new Set(tickets.flatMap((t) => t.legs.map((l) => l.game_id))),
  ]);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const ticketWeeks = weeks
    .filter((w) => w.season === season && tickets.some((t) => t.parlay.week_id === w.id))
    .sort((a, b) => a.week - b.week);
  const playedWeeks = ticketWeeks.filter((w) =>
    tickets.some(
      (t) =>
        t.parlay.week_id === w.id &&
        t.legs.some((l) => gameStarted(gamesById.get(l.game_id))),
    ),
  );
  const week =
    (weekNumber != null ? ticketWeeks.find((w) => w.week === weekNumber) : undefined) ??
    playedWeeks.at(-1) ??
    active;
  const at = week ? ticketWeeks.findIndex((w) => w.id === week.id) : -1;
  const prevWeek = at > 0 ? ticketWeeks[at - 1] : undefined;
  const nextWeek = at >= 0 && at < ticketWeeks.length - 1 ? ticketWeeks[at + 1] : undefined;

  const standings = ticketStandings(tickets, members, {
    weekId: range === "week" ? (week?.id ?? null) : null,
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
        <h2 className="text-xl font-bold text-ink tracking-tight">
          Leaderboard
        </h2>
        <div className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
          <span>Tickets cashed ·</span>
          {range === "week" ? (
            <span className="flex items-center gap-1">
              {prevWeek ? (
                <Link
                  href={`/${slug}/tickets/board?week=${prevWeek.week}`}
                  aria-label={`Week ${prevWeek.week}`}
                  className="rounded-md p-1 text-ink-faint transition hover:text-ink"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : null}
              <span className="font-semibold text-ink">Week {week?.week ?? "—"}</span>
              {nextWeek ? (
                <Link
                  href={`/${slug}/tickets/board?week=${nextWeek.week}`}
                  aria-label={`Week ${nextWeek.week}`}
                  className="rounded-md p-1 text-ink-faint transition hover:text-ink"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </span>
          ) : (
            <span>season to date</span>
          )}
        </div>
      </div>

      <Segmented
        label="Board range"
        value={range}
        options={[
          { value: "week", label: "This week", href: `/${slug}/tickets/board` },
          { value: "season", label: "Season", href: `/${slug}/tickets/board?range=season` },
        ]}
      />

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
                ? "border-transparent bg-ink/[0.04]"
                : "border-transparent bg-chalk shadow-card",
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
                  <span className="ml-1.5 text-xs font-normal text-ink-faint">
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
        <div className="rounded-[1.4rem] bg-chalk shadow-card p-4">
          <p className="text-[11px] font-semibold text-ink-faint">
            Most ridden
          </p>
          <div className="mt-2 flex items-center gap-3">
            <MemberChip name={mostRidden.name} className="h-8 w-8 text-[10px]" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {mostRidden.name}
            </p>
            <span className="shrink-0 font-display text-xl font-bold text-ink">
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
        leader ? "border-transparent bg-chalk py-4 shadow-card" : "border-transparent bg-chalk py-3 shadow-card",
      )}
    >
      <p
        className={cn(
          "text-[11px] font-bold",
          leader ? "text-ink-muted" : "text-ink-faint",
        )}
      >
        {leader ? "Leader" : place === 2 ? "2nd" : "3rd"}
      </p>
      <MemberChip
        name={row.name}
        className={cn(
          "mx-auto mt-2",
          leader ? "h-10 w-10 bg-ink text-[12px] text-on-ink" : "h-8 w-8 text-[10px]",
        )}
      />
      <p className="mt-2 truncate text-xs font-semibold text-ink">{row.name}</p>
      <p
        className={cn(
          "mt-0.5 font-display text-xl font-extrabold leading-none",
          "text-ink",
        )}
      >
        {row.won}-{row.lost}
      </p>
    </div>
  );
}
