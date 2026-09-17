"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BetSlip, type BetSlipLeg } from "@/components/picks/bet-slip";
import { Skeleton } from "@/components/ui/skeleton";
import type { Currency } from "@/lib/types";

type BetSlipResponse = {
  week: { week: number };
  legs: BetSlipLeg[];
  stake: number;
  showMoney: boolean;
  league: { currency: Currency };
};

export default function BetSlipPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [data, setData] = useState<BetSlipResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/leagues/${slug}/bet-slip`);
        if (!res.ok) {
          if (!cancelled) setData(null);
          return;
        }
        const json = (await res.json()) as BetSlipResponse;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [slug]);

  if (loading && !data) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  if (!data) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        Could not load bet slip.
      </p>
    );
  }

  return (
    <BetSlip
      weekNumber={data.week.week}
      legs={data.legs}
      stake={data.stake}
      currency={data.league.currency}
      showMoney={data.showMoney}
    />
  );
}
