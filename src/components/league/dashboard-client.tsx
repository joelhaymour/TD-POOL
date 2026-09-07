"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ParlaySummary } from "@/components/league/parlay-summary";
import { MemberPickStatus } from "@/components/league/member-pick-status";
import { WeeklyResults } from "@/components/league/weekly-results";
import { PlayerList } from "@/components/players/player-list";
import type { PlayerFiltersValue } from "@/components/players/player-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { toPlayerCard } from "@/lib/api/mappers";
import type { LeagueDashboard } from "@/lib/types";

const MEMBER_KEY = (slug: string) => `tdpool:member:${slug}`;

export function DashboardClient({
  slug,
  initialDashboard,
}: {
  slug: string;
  initialDashboard: LeagueDashboard | null;
}) {
  const { toast } = useToast();
  const [dashboard, setDashboard] = useState<LeagueDashboard | null>(
    initialDashboard,
  );
  const [loading, setLoading] = useState(!initialDashboard);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [filters, setFilters] = useState<PlayerFiltersValue>({
    query: "",
    position: "ALL",
    availableOnly: false,
    sort: "rank",
  });
  const [selecting, setSelecting] = useState(false);

  const refresh = useCallback(
    async (silent = false) => {
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
        if (!silent && !dashboard) setDashboard(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug, dashboard],
  );

  useEffect(() => {
    if (!initialDashboard) void refresh();
    const id = window.setInterval(() => void refresh(true), 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount poller once per slug
  }, [slug]);

  useEffect(() => {
    const saved = window.localStorage.getItem(MEMBER_KEY(slug));
    if (saved) setMemberId(saved);
  }, [slug]);

  useEffect(() => {
    if (!dashboard || memberId) return;
    const admin = dashboard.members.find((m) => m.member.role === "admin");
    const first = admin ?? dashboard.members[0];
    if (first) {
      setMemberId(first.member.id);
      window.localStorage.setItem(MEMBER_KEY(slug), first.member.id);
    }
  }, [dashboard, memberId, slug]);

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
    if (!memberId || !dashboard) {
      toast({
        title: "Pick who you are first",
        description: "Select your name above before locking a player.",
        tone: "error",
      });
      return;
    }

    const existing = dashboard.members.find(
      (m) => m.member.id === memberId && m.pick,
    );
    const method = existing ? "PATCH" : "POST";

    setSelecting(true);
    try {
      const res = await fetch("/api/picks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueSlug: slug,
          memberId,
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

      <label className="block rounded-2xl border border-border bg-chalk px-4 py-3 shadow-card">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
          I am
        </span>
        <select
          className="mt-1.5 h-10 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
          value={memberId ?? ""}
          onChange={(e) => {
            const id = e.target.value;
            setMemberId(id);
            window.localStorage.setItem(MEMBER_KEY(slug), id);
          }}
        >
          {dashboard.members.map((m) => (
            <option key={m.member.id} value={m.member.id}>
              {m.member.display_name}
              {m.member.role === "admin" ? " (admin)" : ""}
            </option>
          ))}
        </select>
      </label>

      <MemberPickStatus members={memberRows} defaultOpen />

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
