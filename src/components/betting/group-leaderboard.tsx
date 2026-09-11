import { getStore } from "@/lib/store";
import { cn } from "@/lib/utils/cn";
import { formatAmerican } from "@/lib/utils/odds";
import { legTitle } from "@/lib/props/format";
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          Leaderboard
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Legs hit across every slip · 💀 = slips your miss sank
        </p>
      </div>

      <ol className="overflow-hidden rounded-2xl border border-border bg-chalk shadow-card">
        {standings.map((row, i) => {
          const decided = row.won + row.lost;
          return (
            <li
              key={row.memberId}
              className={cn(
                "flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0",
                row.memberId === viewerMemberId && "bg-turf/5",
              )}
            >
              <span className="w-7 shrink-0 font-display text-lg font-extrabold text-ink-faint">
                {i + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{row.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {row.bestHit
                    ? `Best hit ${formatAmerican(row.bestHit.odds)} · ${row.bestHit.label}`
                    : "No hits yet"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-base font-bold text-ink">
                  {row.won}-{row.lost}
                  <span className="text-ink-muted">
                    {" "}
                    {decided === 0 ? "" : `${Math.round((row.won / decided) * 100)}%`}
                  </span>
                </p>
                <p className="text-[11px] font-semibold text-ink-faint">
                  {row.slipsWon > 0 ? `🏆 ${row.slipsWon}` : ""}
                  {row.slipsWon > 0 && row.busts > 0 ? " · " : ""}
                  {row.busts > 0 ? `💀 ${row.busts}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {!anyGraded ? (
        <p className="text-center text-xs text-ink-faint">
          Standings fill in as legs are graded after each game goes final.
        </p>
      ) : null}
    </div>
  );
}
