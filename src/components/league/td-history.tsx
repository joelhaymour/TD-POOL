"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmerican } from "@/lib/utils/odds";
import { Badge } from "@/components/ui/badge";
import { MemberChip, ResultMark } from "@/components/ui/result-mark";
import { cn } from "@/lib/utils/cn";
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


export function TdHistory() {
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
                  w.status === "complete" || w.status === "final"
                    ? "td"
                    : w.status === "active" || w.status === "locked"
                      ? "locked"
                      : "pending"
                }
              >
                {w.status}
              </Badge>
            </div>
            <ul className="flex flex-col gap-2 px-4 pb-4 pt-3">
              {w.picks.length === 0 ? (
                <li className="py-6 text-center text-sm text-ink-muted">
                  No picks submitted yet.
                </li>
              ) : (
                w.picks.map((p) => (
                  <li
                    key={p.memberId}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5",
                      p.result === "td"
                        ? "border-lime/30 bg-lime/[0.07]"
                        : p.result === "no_td"
                          ? "border-danger/25 bg-danger/[0.06]"
                          : "border-border bg-chalk",
                    )}
                  >
                    <span className="flex w-5 shrink-0 justify-center">
                      <ResultMark result={p.result as "td" | "no_td" | "pending"} />
                    </span>
                    <MemberChip name={p.memberName} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${slug}/pool/players/${p.playerId}`}
                        className="block truncate text-sm font-semibold text-ink hover:underline"
                      >
                        {p.playerName}
                      </Link>
                      <p className="truncate text-[11px] uppercase tracking-wide text-ink-faint">
                        {[p.team, p.memberName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-sm font-bold text-turf">
                      {formatAmerican(p.americanOdds)}
                    </span>
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
