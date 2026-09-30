"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmerican } from "@/lib/utils/odds";
import { cn } from "@/lib/utils/cn";
import { MemberChip } from "@/components/ui/result-mark";

type Standing = {
  rank: number;
  memberId: string;
  memberName: string;
  correct: number;
  decided: number;
  hitPct: number;
  avgOdds: number | null;
};

type LeaderboardResponse = {
  standings: Standing[];
  weeksCounted: number;
};

export function TdLeaderboard({ viewerMemberId }: { viewerMemberId?: string }) {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/leagues/${slug}/leaderboard`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setData(null);
          return;
        }
        const json = (await res.json()) as LeaderboardResponse;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading && !data) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }

  if (!data) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        Leaderboard unavailable.
      </p>
    );
  }

  const [first, second, third] = data.standings;
  const best = data.standings.reduce<Standing | null>(
    (top, row) =>
      row.avgOdds != null && (!top?.avgOdds || row.avgOdds > top.avgOdds)
        ? row
        : top,
    null,
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink tracking-tight">
          Leaderboard
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Correct picks over decided results
          {data.weeksCounted > 1 ? ` · ${data.weeksCounted} weeks` : ""}
        </p>
      </div>

      {data.standings.length === 0 ? (
        <p className="rounded-[1.4rem] bg-chalk shadow-card px-4 py-8 text-center text-sm text-ink-muted">
          No members yet.
        </p>
      ) : (
        <>
          {first && first.decided > 0 ? (
            <div className="grid grid-cols-3 items-end gap-2">
              <Podium row={second} place={2} />
              <Podium row={first} place={1} />
              <Podium row={third} place={3} />
            </div>
          ) : null}

          <ul className="flex flex-col gap-2">
            {data.standings.map((row) => (
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
                  {row.rank}
                </span>
                <MemberChip name={row.memberName} className="h-7 w-7 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {row.memberName}
                    {row.memberId === viewerMemberId ? (
                      <span className="ml-1.5 text-xs font-normal text-ink-faint">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[11px] text-ink-faint">
                    {row.avgOdds != null
                      ? `Avg odds ${formatAmerican(row.avgOdds)}`
                      : "No decided picks yet"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-lg font-extrabold leading-none text-ink">
                    {row.correct}/{row.decided}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {row.decided === 0 ? "—" : `${row.hitPct}%`}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {best?.avgOdds != null ? (
            <div className="rounded-[1.4rem] bg-chalk shadow-card p-4">
              <p className="text-[11px] font-semibold text-ink-faint">
                Longest average odds
              </p>
              <div className="mt-2 flex items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {best.memberName}
                </p>
                <span className="shrink-0 font-display text-xl font-bold text-ink">
                  {formatAmerican(best.avgOdds)}
                </span>
              </div>
            </div>
          ) : null}
        </>
      )}
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
        name={row.memberName}
        className={cn(
          "mx-auto mt-2",
          leader ? "h-10 w-10 bg-ink text-[12px] text-white" : "h-8 w-8 text-[10px]",
        )}
      />
      <p className="mt-2 truncate text-xs font-semibold text-ink">{row.memberName}</p>
      <p
        className={cn(
          "mt-0.5 font-display text-xl font-extrabold leading-none",
          "text-ink",
        )}
      >
        {row.correct}/{row.decided}
      </p>
    </div>
  );
}
