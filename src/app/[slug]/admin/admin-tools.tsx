"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { LeagueDashboard } from "@/lib/types";
import type { SyncNflWeekSummary } from "@/lib/services/sync-nfl-week";

const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";

const labelClass =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint";

export function AdminTools({
  slug,
  viewerMemberId,
}: {
  slug: string;
  viewerMemberId: string;
}) {
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<LeagueDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncNflWeekSummary | null>(null);
  const [overrideMemberId, setOverrideMemberId] = useState("");
  const [overridePlayerId, setOverridePlayerId] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [oddsRefreshing, setOddsRefreshing] = useState(false);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [lastOddsSync, setLastOddsSync] = useState<{
    source: string;
    quotes: number;
    playersUpdated: number;
    fetchedAt: string;
    error?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/leagues/${slug}`);
      if (!res.ok) {
        setDashboard(null);
        return;
      }
      const data = (await res.json()) as LeagueDashboard;
      setDashboard(data);
      setOverrideMemberId((prev) => prev || data.members[0]?.member.id || "");
      setOverridePlayerId(
        (prev) => prev || data.ranked_players[0]?.player.id || "",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/leagues/${slug}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        error?: string;
        summary?: SyncNflWeekSummary;
      };
      if (!res.ok || !data.summary) {
        toast({
          title: "Sync failed",
          description: data.error ?? "Try again.",
          tone: "error",
        });
        return;
      }

      setLastSync(data.summary);
      const s = data.summary;
      toast({
        title: "Game status synced",
        description: `${s.gamesUpdated} games · ${s.picksResolved} picks updated · ${s.hits} TD / ${s.misses} miss / ${s.pending} pending`,
        tone: "success",
      });
      await refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setSyncing(false);
    }
  }

  async function runOddsRefresh() {
    setOddsRefreshing(true);
    try {
      const res = await fetch(`/api/leagues/${slug}/odds-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as {
        error?: string;
        summary?: {
          source: string;
          quotes: number;
          playersUpdated: number;
          fetchedAt: string;
          error?: string;
        };
      };
      if (!res.ok || !data.summary) {
        toast({
          title: "Odds refresh failed",
          description: data.error ?? "Try again.",
          tone: "error",
        });
        return;
      }
      setLastOddsSync(data.summary);
      toast({
        title: "Odds refreshed",
        description: `${data.summary.source} · ${data.summary.quotes} quotes · ${data.summary.playersUpdated} players${
          data.summary.error ? ` · ${data.summary.error}` : ""
        }`,
        tone: data.summary.error ? "error" : "success",
      });
      await refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setOddsRefreshing(false);
    }
  }

  async function onOverride() {
    if (!dashboard || !overrideMemberId || !overridePlayerId) return;
    setOverriding(true);
    try {
      const res = await fetch("/api/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueSlug: slug,
          memberId: overrideMemberId,
          playerId: overridePlayerId,
          weekId: dashboard.week.id,
          override: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Override failed",
          description: data.error ?? "Player may already be taken.",
          tone: "error",
        });
        return;
      }
      toast({ title: "Pick overridden", tone: "success" });
      await refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setOverriding(false);
    }
  }

  async function onRemoveMember(memberId: string, displayName: string) {
    setPendingMemberId(memberId);
    try {
      const res = await fetch(
        `/api/leagues/${slug}/members/${memberId}/remove`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Remove failed",
          description: data.error ?? "Try again.",
          tone: "error",
        });
        return;
      }
      toast({
        title: "Member removed",
        description: `${displayName} can no longer pick.`,
        tone: "success",
      });
      await refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setPendingMemberId(null);
    }
  }

  async function onSetRole(
    memberId: string,
    displayName: string,
    role: "admin" | "member",
  ) {
    setPendingMemberId(memberId);
    try {
      const res = await fetch(`/api/leagues/${slug}/members/${memberId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Could not change role",
          description: data.error ?? "Try again.",
          tone: "error",
        });
        return;
      }
      toast({
        title: role === "admin" ? "Admin added" : "Admin removed",
        description:
          role === "admin"
            ? `${displayName} can now manage the league.`
            : `${displayName} is back to a regular member.`,
        tone: "success",
      });
      await refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setPendingMemberId(null);
    }
  }

  if (loading && !dashboard) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
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

  const adminCount = dashboard.members.filter(
    (m) => m.member.role === "admin",
  ).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          Admin
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Override picks and force-refresh results or odds. Sync runs
          automatically when the league is opened.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-chalk p-4 shadow-card">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
          Results
        </h3>
        <p className="text-sm leading-relaxed text-ink-muted">
          Game status and pick results refresh automatically whenever someone
          opens the league (about once a minute). Use force refresh if you need
          an immediate update.
        </p>
        <Button
          fullWidth
          variant="secondary"
          disabled={syncing}
          onClick={() => void runSync()}
        >
          {syncing ? "Refreshing…" : "Force refresh now"}
        </Button>
        {lastSync ? (
          <p className="rounded-xl bg-field px-3 py-2 text-xs text-ink-muted">
            Last sync · W{lastSync.week} · {lastSync.gamesUpdated} games ·{" "}
            {lastSync.hits} TD / {lastSync.misses} miss / {lastSync.pending}{" "}
            pending
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-chalk p-4 shadow-card">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
          Odds
        </h3>
        <p className="text-sm leading-relaxed text-ink-muted">
          Anytime TD odds refresh automatically when the league is opened
          (about every 5 minutes).
        </p>
        <p className="text-xs text-ink-muted">
          Source:{" "}
          <span className="font-semibold text-ink">
            {dashboard.odds_source ?? "—"}
          </span>
          {" · "}
          Last snapshot:{" "}
          {dashboard.odds_updated_at
            ? new Date(dashboard.odds_updated_at).toLocaleString()
            : "n/a"}
        </p>
        <Button
          fullWidth
          variant="secondary"
          disabled={oddsRefreshing}
          onClick={() => void runOddsRefresh()}
        >
          {oddsRefreshing ? "Refreshing…" : "Force odds refresh"}
        </Button>
        {lastOddsSync ? (
          <p className="rounded-xl bg-field px-3 py-2 text-xs text-ink-muted">
            Last force refresh · {lastOddsSync.source} · {lastOddsSync.quotes}{" "}
            quotes · {lastOddsSync.playersUpdated} players
            {lastOddsSync.error ? ` · ${lastOddsSync.error}` : ""}
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-chalk p-4 shadow-card">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
          Override pick
        </h3>
        <label className="block">
          <span className={labelClass}>Member</span>
          <select
            className={inputClass}
            value={overrideMemberId}
            onChange={(e) => setOverrideMemberId(e.target.value)}
          >
            {dashboard.members.map((m) => (
              <option key={m.member.id} value={m.member.id}>
                {m.member.display_name}
                {m.player ? ` — ${m.player.name}` : " — no pick"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Player</span>
          <select
            className={inputClass}
            value={overridePlayerId}
            onChange={(e) => setOverridePlayerId(e.target.value)}
          >
            {dashboard.ranked_players.map((p) => (
              <option key={p.player.id} value={p.player.id}>
                #{p.td_pool_rank} {p.player.name} ({p.player.team})
                {p.taken_by ? ` — taken by ${p.taken_by}` : ""}
              </option>
            ))}
          </select>
        </label>
        <Button
          fullWidth
          disabled={overriding}
          onClick={() => void onOverride()}
        >
          {overriding ? "Saving…" : "Force assign pick"}
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-chalk p-4 shadow-card">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
          Members
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          Invite friends from Settings (link + join PIN). Admins can change
          settings and correct picks. Removing a member soft-deactivates them;
          pick history is kept.
        </p>
        <ul className="mt-3 divide-y divide-border">
          {dashboard.members.map((m) => {
            const isAdminMember = m.member.role === "admin";
            const isSelf = m.member.id === viewerMemberId;
            // The last admin can neither be demoted nor removed, or the league
            // would be left with nobody able to manage it.
            const isLastAdmin = isAdminMember && adminCount <= 1;
            const busy = pendingMemberId === m.member.id;

            return (
              <li key={m.member.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-ink">
                      {m.member.display_name}
                      {isSelf ? (
                        <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-turf">
                          You
                        </span>
                      ) : null}
                      <span className="ml-2 text-xs font-medium uppercase text-ink-faint">
                        {m.member.role}
                      </span>
                    </span>
                    <p className="truncate text-ink-muted">
                      {m.player?.name ?? "Needs pick"}
                      {m.pick?.result === "td"
                        ? " · ✅ TD"
                        : m.pick?.result === "no_td"
                          ? " · ❌ NO TD"
                          : m.pick
                            ? " · ⏳"
                            : ""}
                    </p>
                  </div>
                </div>

                {isLastAdmin ? null : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void onSetRole(
                          m.member.id,
                          m.member.display_name,
                          isAdminMember ? "member" : "admin",
                        )
                      }
                    >
                      {busy
                        ? "…"
                        : isAdminMember
                          ? isSelf
                            ? "Step down as admin"
                            : "Remove admin"
                          : "Make admin"}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void onRemoveMember(m.member.id, m.member.display_name)
                      }
                    >
                      {busy ? "…" : "Remove"}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
