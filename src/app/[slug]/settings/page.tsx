"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  MoneySettingsForm,
  type MoneySettingsValue,
} from "@/components/league/money-settings-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { League, PickLockType } from "@/lib/types";

const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";

export default function SettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [allowPickChanges, setAllowPickChanges] = useState(true);
  const [lockType, setLockType] = useState<PickLockType>("individual_game");
  const [money, setMoney] = useState<MoneySettingsValue>({
    betting_mode: "individual",
    contribution_per_member: 10,
    member_count: 12,
    fixed_weekly_stake: 100,
    currency: "USD",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/leagues/${slug}`);
        if (!res.ok) return;
        const data = (await res.json()) as { league: League };
        if (cancelled) return;
        const l = data.league;
        setLeagueName(l.name);
        setAllowPickChanges(l.allow_pick_changes);
        setLockType(l.pick_lock_type);
        setMoney({
          betting_mode: l.betting_mode,
          contribution_per_member: l.contribution_per_member ?? 10,
          member_count: l.member_count,
          fixed_weekly_stake: l.fixed_weekly_stake ?? 100,
          currency: l.currency,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!adminPin.trim()) {
      toast({
        title: "Admin PIN required",
        description: "Enter the league admin PIN to save.",
        tone: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/leagues/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_pin: adminPin,
          name: leagueName,
          allow_pick_changes: allowPickChanges,
          pick_lock_type: lockType,
          betting_mode: money.betting_mode,
          contribution_per_member: money.contribution_per_member,
          member_count: money.member_count,
          fixed_weekly_stake: money.fixed_weekly_stake,
          currency: money.currency,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Save failed",
          description: data.error ?? "Check your admin PIN.",
          tone: "error",
        });
        return;
      }
      toast({ title: "Settings saved", tone: "success" });
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          League settings
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Changes require the admin PIN.
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
          League name
        </span>
        <input
          className={inputClass}
          value={leagueName}
          onChange={(e) => setLeagueName(e.target.value)}
        />
      </label>

      <MoneySettingsForm value={money} onChange={setMoney} />

      <label className="flex items-center gap-3 rounded-xl border border-border bg-chalk px-4 py-3">
        <input
          type="checkbox"
          className="accent-turf"
          checked={allowPickChanges}
          onChange={(e) => setAllowPickChanges(e.target.checked)}
        />
        <span className="text-sm font-semibold text-ink">
          Allow pick changes before lock
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
          Pick lock type
        </span>
        <select
          className={inputClass}
          value={lockType}
          onChange={(e) => setLockType(e.target.value as PickLockType)}
        >
          <option value="individual_game">Individual game kickoff</option>
          <option value="first_kickoff">First kickoff of the week</option>
          <option value="custom">Custom deadline</option>
        </select>
      </label>

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
          placeholder="••••"
        />
      </label>

      <Button type="submit" fullWidth disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>

      <Link
        href={`/${slug}/admin`}
        className="block rounded-xl border border-border bg-field px-4 py-3 text-center text-sm font-bold text-turf hover:bg-field-deep"
      >
        Open admin tools →
      </Link>
    </form>
  );
}
