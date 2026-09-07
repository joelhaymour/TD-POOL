"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { LeagueDashboard } from "@/lib/types";
import type { SyncNflWeekSummary } from "@/lib/services/sync-nfl-week";

export default function AdminPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<LeagueDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [reseeding, setReseeding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [lastSync, setLastSync] = useState<SyncNflWeekSummary | null>(null);
  const [overrideMemberId, setOverrideMemberId] = useState("");
  const [overridePlayerId, setOverridePlayerId] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [overriding, setOverriding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
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

  async function runSync(simulateFinal: boolean) {
    if (!adminPin.trim()) {
      toast({
        title: "Admin PIN required",
        description: "Enter the admin PIN to sync NFL results.",
        tone: "error",
      });
      return;
    }

    if (simulateFinal) setSimulating(true);
    else setSyncing(true);

    try {
      const res = await fetch(`/api/leagues/${slug}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPin, simulateFinal }),
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
        title: simulateFinal
          ? "Finals simulated & TDs resolved"
          : "Game status synced",
        description: `${s.gamesUpdated} games · ${s.picksResolved} picks updated · ${s.hits} TD / ${s.misses} miss / ${s.pending} pending`,
        tone: "success",
      });
      await refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setSyncing(false);
      setSimulating(false);
    }
  }

  async function onReseed() {
    setReseeding(true);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = (await res.json()) as { error?: string; slug?: string };
      if (!res.ok) {
        toast({
          title: "Reseed failed",
          description: data.error ?? "Try again.",
          tone: "error",
        });
        return;
      }
      setLastSync(null);
      toast({
        title: "Store reseeded",
        description: `Demo league: ${data.slug ?? "joels-league"}`,
        tone: "success",
      });
      await refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setReseeding(false);
    }
  }

  async function onOverride() {
    if (!dashboard || !overrideMemberId || !overridePlayerId) return;
    if (!adminPin.trim()) {
      toast({
        title: "Admin PIN required",
        description: "Enter the admin PIN to override picks.",
        tone: "error",
      });
      return;
    }
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
          adminPin,
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

  const inputClass =
    "h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          Admin
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Sync NFL results, override picks, and reset local seed data.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-chalk p-4 shadow-card">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
          Sync NFL results
        </h3>
        <p className="text-sm leading-relaxed text-ink-muted">
          Refresh game status for Week {dashboard.week.week} and resolve whether
          each pick scored a TD. Use simulate to force all games to final.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
            Admin PIN
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            className={inputClass}
            value={adminPin}
            onChange={(e) => setAdminPin(e.target.value)}
            placeholder="1234"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            fullWidth
            variant="secondary"
            disabled={syncing || simulating}
            onClick={() => void runSync(false)}
          >
            {syncing ? "Syncing…" : "Sync game status"}
          </Button>
          <Button
            fullWidth
            disabled={syncing || simulating}
            onClick={() => void runSync(true)}
          >
            {simulating ? "Resolving…" : "Simulate finals & resolve TDs"}
          </Button>
        </div>
        {lastSync ? (
          <p className="rounded-xl bg-field px-3 py-2 text-xs text-ink-muted">
            Last sync · W{lastSync.week} · {lastSync.gamesUpdated} games ·{" "}
            {lastSync.hits} TD / {lastSync.misses} miss / {lastSync.pending}{" "}
            pending
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-chalk p-4 shadow-card">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
          Odds refresh
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Phase 1 uses mock odds. Live refresh arrives with the provider
          integration. Last mock update:{" "}
          {dashboard.odds_updated_at
            ? new Date(dashboard.odds_updated_at).toLocaleString()
            : "n/a"}
          .
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-chalk p-4 shadow-card">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
          Override pick
        </h3>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
            Member
          </span>
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
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
            Player
          </span>
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
        <ul className="mt-3 divide-y divide-border">
          {dashboard.members.map((m) => (
            <li
              key={m.member.id}
              className="flex items-center justify-between gap-2 py-2.5 text-sm"
            >
              <span className="font-semibold text-ink">
                {m.member.display_name}
                <span className="ml-2 text-xs font-medium uppercase text-ink-faint">
                  {m.member.role}
                </span>
              </span>
              <span className="truncate text-ink-muted">
                {m.player?.name ?? "Needs pick"}
                {m.pick?.result === "td"
                  ? " · ✅ TD"
                  : m.pick?.result === "no_td"
                    ? " · ❌ NO TD"
                    : m.pick
                      ? " · ⏳"
                      : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-danger/25 bg-danger/5 p-4">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-danger">
          Dev: reseed store
        </h3>
        <p className="mt-2 text-sm text-ink-muted">
          Wipes local `.data/store.json` and restores the joels-league demo.
        </p>
        <Button
          variant="danger"
          className="mt-3"
          fullWidth
          disabled={reseeding}
          onClick={() => void onReseed()}
        >
          {reseeding ? "Reseeding…" : "Reseed local store"}
        </Button>
      </section>
    </div>
  );
}
