"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ParlaySummary } from "@/components/league/parlay-summary";
import { MemberPickStatus } from "@/components/league/member-pick-status";
import { WeeklyResults } from "@/components/league/weekly-results";
import { PlayerList } from "@/components/players/player-list";
import type { PlayerFiltersValue } from "@/components/players/player-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useLeagueRealtime } from "@/hooks/use-league-realtime";
import { toPlayerCard } from "@/lib/api/mappers";
import type { LeagueDashboard } from "@/lib/types";

export function DashboardClient({
  slug,
  initialDashboard,
  viewer,
}: {
  slug: string;
  initialDashboard: LeagueDashboard | null;
  viewer: { memberId: string };
}) {
  const { toast } = useToast();
  const [dashboard, setDashboard] = useState<LeagueDashboard | null>(
    initialDashboard,
  );
  const [loading, setLoading] = useState(!initialDashboard);
  const [filters, setFilters] = useState<PlayerFiltersValue>({
    query: "",
    position: "ALL",
    availableOnly: false,
    sort: "rank",
  });
  const [selecting, setSelecting] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/leagues/${slug}`, { cache: "no-store" });
      if (!res.ok) {
        if (!silent) setDashboard(null);
        return;
      }
      const data = (await res.json()) as LeagueDashboard;
      setDashboard(data);
    } catch {
      // Keep last good snapshot on transient errors
    } finally {
      if (!silent) setLoading(false);
    }
  }, [slug]);

  const onRealtimeInvalidate = useCallback(() => {
    void refresh(true);
  }, [refresh]);

  const { connected: realtimeConnected } = useLeagueRealtime(
    dashboard?.league.id,
    onRealtimeInvalidate,
  );

  useEffect(() => {
    if (!initialDashboard) void refresh();
  }, [slug, initialDashboard, refresh]);

  // Picks arrive over Supabase realtime; polling is only a fallback, so it can
  // be slow. Tight intervals used to trigger a provider refresh per request.
  useEffect(() => {
    const ms = realtimeConnected ? 120_000 : 30_000;
    const id = window.setInterval(() => void refresh(true), ms);
    return () => window.clearInterval(id);
  }, [slug, realtimeConnected, refresh]);

  const players = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.ranked_players.map((row) =>
      toPlayerCard(row, slug, dashboard.picks_locked),
    );
  }, [dashboard, slug]);

  const memberRows = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.members.map((m) => ({
      memberId: m.member.id,
      memberName: m.member.display_name,
      playerId: m.player?.id ?? null,
      playerName: m.player?.name ?? null,
      playerHref: m.player ? `/${slug}/players/${m.player.id}` : null,
      result: m.pick?.result ?? "pending",
    }));
  }, [dashboard, slug]);

  async function onSelect(playerId: string) {
    if (!dashboard) return;

    const existing = dashboard.members.find(
      (m) => m.member.id === viewer.memberId && m.pick,
    );

    setSelecting(true);
    try {
      const res = await fetch("/api/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueSlug: slug,
          playerId,
          weekId: dashboard.week.id,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Pick failed",
          description: data.error ?? "Try another player.",
          tone: "error",
        });
        return;
      }
      toast({
        title: existing ? "Pick updated" : "Pick locked in",
        tone: "success",
      });
      await refresh(true);
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setSelecting(false);
    }
  }

  if (loading && !dashboard) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        League not found.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ParlaySummary
        weekNumber={dashboard.week.week}
        picksSubmitted={dashboard.parlay.picks_submitted}
        totalMembers={dashboard.parlay.picks_total}
        estimatedAmericanOdds={dashboard.parlay.combined_american}
        stake={dashboard.parlay.stake}
        payout={dashboard.parlay.estimated_payout}
        showMoney={dashboard.league.betting_mode !== "none"}
        currency={dashboard.league.currency}
        oddsUpdatedAt={dashboard.odds_updated_at}
        oddsSource={dashboard.odds_source}
        oddsNote={dashboard.odds_note}
      />

      <WeeklyResults
        members={memberRows}
        picksSubmitted={dashboard.parlay.picks_submitted}
        totalMembers={dashboard.parlay.picks_total}
        stake={dashboard.parlay.stake}
        payout={dashboard.parlay.estimated_payout}
        currency={dashboard.league.currency}
        showMoney={dashboard.league.betting_mode !== "none"}
      />

      <MemberPickStatus
        members={memberRows}
        defaultOpen
        highlightMemberId={viewer.memberId}
      />

      <div>
        <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
          Player board
        </h2>
        <PlayerList
          players={players}
          filters={filters}
          onFiltersChange={setFilters}
          onSelect={onSelect}
          selectDisabled={selecting || dashboard.picks_locked}
        />
      </div>
    </div>
  );
}
