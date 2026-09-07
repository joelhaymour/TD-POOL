"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmerican } from "@/lib/utils/odds";
import { Badge } from "@/components/ui/badge";
import type { PickResult } from "@/lib/types";

type HistoryWeek = {
  week: { id: string; week: number; season: number; label?: string };
  picks_submitted: number;
  picks_total: number;
  status: string;
  picks: Array<{
    memberId: string;
    memberName: string;
    playerId: string;
    playerName: string;
    team: string;
    result: PickResult | string;
    americanOdds: number;
  }>;
  parlay: {
    combined_american: number | null;
    estimated_payout: number | null;
  };
};

type HistoryResponse = {
  weeks: HistoryWeek[];
};

function resultBadge(result: string) {
  if (result === "td") {
    return (
      <Badge status="td" className="shrink-0">
        ✅ TD
      </Badge>
    );
  }
  if (result === "no_td") {
    return (
      <Badge status="no_td" className="shrink-0">
        ❌ NO TD
      </Badge>
    );
  }
  return (
    <Badge status="pending" className="shrink-0">
      ⏳ Pending
    </Badge>
  );
}

export default function HistoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/leagues/${slug}/history`);
        if (!res.ok) {
          if (!cancelled) setData(null);
          return;
        }
        const json = (await res.json()) as HistoryResponse;
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

  if (!data || data.weeks.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        No history yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          Season history
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Weekly picks with TD results after sync.
        </p>
      </div>

      {data.weeks.map((w) => {
        const hits = w.picks.filter((p) => p.result === "td").length;
        const decided = w.picks.filter(
          (p) => p.result === "td" || p.result === "no_td",
        ).length;

        return (
          <section
            key={w.week.id}
            className="overflow-hidden rounded-2xl border border-border bg-chalk shadow-card"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border bg-field px-4 py-3">
              <div>
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                  {w.week.label ?? `Week ${w.week.week}`}
                </h3>
                <p className="text-xs text-ink-muted">
                  {w.picks_submitted}/{w.picks_total} picks
                  {decided > 0 ? ` · ${hits}/${decided} TD` : ""}
                  {w.parlay.combined_american != null
                    ? ` · ${formatAmerican(w.parlay.combined_american)}`
                    : ""}
                </p>
              </div>
              <Badge
                status={
                  w.status === "final"
                    ? "td"
                    : w.status === "locked"
                      ? "locked"
                      : "pending"
                }
              >
                {w.status}
              </Badge>
            </div>
            <ul className="divide-y divide-border">
              {w.picks.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-ink-muted">
                  No picks submitted yet.
                </li>
              ) : (
                w.picks.map((p) => (
                  <li
                    key={p.memberId}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{p.memberName}</p>
                      <Link
                        href={`/${slug}/players/${p.playerId}`}
                        className="truncate text-turf hover:underline"
                      >
                        {p.playerName} ({p.team})
                      </Link>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-display text-base font-bold text-ink">
                        {formatAmerican(p.americanOdds)}
                      </span>
                      {resultBadge(p.result)}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
