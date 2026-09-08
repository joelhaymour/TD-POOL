"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  PlayerDetail,
  type PlayerDetailData,
} from "@/components/players/player-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

type DetailResponse = {
  player: PlayerDetailData;
  week: { id: string; week: number };
  picks_locked: boolean;
  league: { allow_pick_changes: boolean };
};

export default function PlayerDetailPage() {
  const params = useParams<{ slug: string; playerId: string }>();
  const { slug, playerId } = params;
  const { toast } = useToast();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leagues/${slug}/players/${playerId}`);
      if (!res.ok) {
        setData(null);
        return;
      }
      setData((await res.json()) as DetailResponse);
    } finally {
      setLoading(false);
    }
  }, [slug, playerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSelect(id: string) {
    if (!data) return;

    setSelecting(true);
    try {
      const res = await fetch("/api/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueSlug: slug,
          playerId: id,
          weekId: data.week.id,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Pick failed",
          description: body.error ?? "Try again.",
          tone: "error",
        });
        return;
      }
      toast({ title: "Pick locked in", tone: "success" });
      await refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setSelecting(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        Player not found.
      </p>
    );
  }

  return (
    <div>
      <Link
        href={`/${slug}`}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to picks
      </Link>
      <PlayerDetail
        player={data.player}
        onSelect={onSelect}
        selectDisabled={selecting || data.picks_locked}
      />
    </div>
  );
}
