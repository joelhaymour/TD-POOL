import { getStore } from "@/lib/store";
import { cn } from "@/lib/utils/cn";
import { formatAmerican } from "@/lib/utils/odds";
import { legTitle } from "@/lib/props/format";
import { MemberChip } from "@/components/ui/result-mark";
import type { League } from "@/lib/types";

type Standing = {
  memberId: string;
  name: string;
  won: number;
  lost: number;
  slipsWon: number;
  /** Slips this member's miss sank. */
  busts: number;
  bestHit: { odds: number; label: string } | null;
};

/**
 * Members ranked by legs hit. Every graded leg counts, including ones on a
 * slip that is still live, so the board moves game by game on Sunday.
 */
export async function GroupLeaderboard({
  league,
  viewerMemberId,
}: {
  league: League;
  viewerMemberId: string;
}) {
  const store = getStore();
  const [slips, members] = await Promise.all([
    store.listParlaysForLeague(league.id),
    store.listMembers(league.id),
  ]);

  const table = new Map<string, Standing>(
    members
      .filter((m) => m.active)
      .map((m) => [
        m.id,
        {
          memberId: m.id,
          name: m.display_name,
          won: 0,
          lost: 0,
          slipsWon: 0,
          busts: 0,
          bestHit: null,
        },
      ]),
  );

  for (const { parlay, legs } of slips) {
    const onSlip = new Set<string>();
    const sank = new Set<string>();
    for (const leg of legs) {
      const row = table.get(leg.member_id);
      if (!row) continue;
      onSlip.add(leg.member_id);
      if (leg.result === "won") {
        row.won += 1;
        if (!row.bestHit || leg.american_odds > row.bestHit.odds) {
          row.bestHit = { odds: leg.american_odds, label: legTitle(leg) };
        }
      } else if (leg.result === "lost") {
        row.lost += 1;
        sank.add(leg.member_id);
      }
    }
    if (parlay.result === "won") {
      for (const id of onSlip) table.get(id)!.slipsWon += 1;
    }
    if (parlay.result === "lost") {
      for (const id of sank) table.get(id)!.busts += 1;
    }
  }

  const standings = [...table.values()].sort((a, b) => {
    const pct = (s: Standing) => (s.won + s.lost === 0 ? -1 : s.won / (s.won + s.lost));
    return b.won - a.won || pct(b) - pct(a) || a.name.localeCompare(b.name);
  });
  const anyGraded = standings.some((s) => s.won + s.lost > 0);
  const [first, second, third] = standings;
  const bestLeg = standings.reduce<{ name: string; hit: Standing["bestHit"] } | null>(
    (best, row) =>
      row.bestHit && (!best?.hit || row.bestHit.odds > best.hit.odds)
        ? { name: row.name, hit: row.bestHit }
        : best,
    null,
  );
  const rate = (row: Standing) =>
    row.won + row.lost === 0
      ? null
      : `${Math.round((row.won / (row.won + row.lost)) * 100)}%`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          Leaderboard
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Legs hit across every parlay · season to date
        </p>
      </div>

      {/* The top three, sized by where they finished. */}
      {anyGraded && first ? (
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
                {row.bestHit
                  ? `Best hit ${formatAmerican(row.bestHit.odds)} · ${row.bestHit.label}`
                  : "No hits yet"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-lg font-extrabold leading-none text-ink">
                {row.won}-{row.lost}
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">{rate(row) ?? "—"}</p>
            </div>
          </li>
        ))}
      </ul>

      {bestLeg?.hit ? (
        <div className="rounded-2xl border border-border bg-chalk p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
            Leg of the season
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {bestLeg.hit.label}
              </p>
              <p className="truncate text-[11px] text-ink-faint">{bestLeg.name}</p>
            </div>
            <span className="shrink-0 font-display text-xl font-extrabold text-lime">
              {formatAmerican(bestLeg.hit.odds)}
            </span>
          </div>
        </div>
      ) : null}

      {!anyGraded ? (
        <p className="text-center text-xs text-ink-faint">
          Standings fill in as legs are graded after each game goes final.
        </p>
      ) : null}
    </div>
  );
}

/** One place on the podium; the leader's card is taller and lit. */
function Podium({ row, place }: { row: Standing | undefined; place: number }) {
  if (!row) return <div />;
  const leader = place === 1;
  return (
    <div
      className={cn(
        "rounded-2xl border px-2 text-center",
        leader
          ? "border-lime/40 bg-lime/[0.1] py-4"
          : "border-border bg-chalk py-3",
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
