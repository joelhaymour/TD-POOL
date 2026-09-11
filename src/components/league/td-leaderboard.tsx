"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmerican } from "@/lib/utils/odds";

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

export function TdLeaderboard() {
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          Leaderboard
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Correct picks over decided results
          {data.weeksCounted > 1 ? ` · ${data.weeksCounted} weeks` : ""}.
        </p>
      </div>

      <ol className="overflow-hidden rounded-2xl border border-border bg-chalk shadow-card">
        {data.standings.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-ink-muted">
            No members yet.
          </li>
        ) : (
          data.standings.map((row) => (
            <li
              key={row.memberId}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="w-7 shrink-0 font-display text-lg font-extrabold text-ink-faint">
                {row.rank}.
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">
                  {row.memberName}
                </p>
                {row.avgOdds != null ? (
                  <p className="text-xs text-ink-muted">
                    Avg odds {formatAmerican(row.avgOdds)}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-base font-bold text-ink">
                  {row.correct}/{row.decided}
                  <span className="text-ink-muted"> — </span>
                  {row.decided === 0 ? "—" : `${row.hitPct}%`}
                </p>
              </div>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
