"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MoneySettingsForm,
  type MoneySettingsValue,
} from "@/components/league/money-settings-form";
import { PickModeField } from "@/components/league/pick-mode-field";
import { SectionToggles } from "@/components/league/section-toggles";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ALL_SECTIONS_ON } from "@/lib/league/sections";
import type { League, LeagueSections, PickLockType, PickMode } from "@/lib/types";

const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";

const labelClass =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint";

export function SettingsForm({
  slug,
  isAdmin,
}: {
  slug: string;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leagueName, setLeagueName] = useState("");
  const [allowPickChanges, setAllowPickChanges] = useState(true);
  const [lockType, setLockType] = useState<PickLockType>("individual_game");
  const [money, setMoney] = useState<MoneySettingsValue>({
    betting_mode: "fixed",
    fixed_weekly_stake: 100,
    currency: "USD",
  });

  const [joinPin, setJoinPin] = useState<string | null>(null);
  const [sections, setSections] = useState<LeagueSections>(ALL_SECTIONS_ON);
  const [pickMode, setPickMode] = useState<PickMode>("open");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return `/${slug}`;
    return `${window.location.origin}/${slug}`;
  }, [slug]);

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
        setSections(l.sections);
        setPickMode(l.pick_mode);
        setMoney({
          betting_mode: l.betting_mode,
          // A league that was on the old per-member mode reads back as fixed
          // at the amount it was already staking.
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

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied`, tone: "success" });
    } catch {
      toast({ title: "Copy failed", description: value, tone: "error" });
    }
  }

  async function loadInvite(regenerate = false) {
    setInviteLoading(true);
    try {
      const res = await fetch(`/api/leagues/${slug}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const data = (await res.json()) as { error?: string; join_pin?: string };
      if (!res.ok || !data.join_pin) {
        toast({
          title: regenerate
            ? "Could not regenerate PIN"
            : "Could not load invite",
          description: data.error ?? "Try again.",
          tone: "error",
        });
        return;
      }
      setJoinPin(data.join_pin);
      toast({
        title: regenerate ? "Join PIN regenerated" : "Invite details loaded",
        tone: "success",
      });
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setInviteLoading(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/leagues/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leagueName,
          sections,
          allow_pick_changes: allowPickChanges,
          pick_lock_type: lockType,
          ...(sections.group_bets ? { pick_mode: pickMode } : {}),
          betting_mode: money.betting_mode,
          fixed_weekly_stake: money.fixed_weekly_stake,
          currency: money.currency,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Save failed",
          description: data.error ?? "Try again.",
          tone: "error",
        });
        return;
      }
      toast({ title: "Settings saved", tone: "success" });
      // The header's section pills and the bottom bar are server-rendered.
      router.refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/leagues/${slug}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Couldn't delete the league",
          description: data.error ?? "Try again.",
          tone: "error",
        });
        return;
      }
      setDeleteOpen(false);
      toast({ title: "League deleted", tone: "success" });
      router.push("/");
      router.refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setDeleting(false);
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
    <>
    <form onSubmit={onSave} className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
          League settings
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {isAdmin
            ? "You're the league admin, so these are yours to change."
            : "Only league admins can change these."}
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-chalk p-4 shadow-card">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
          Invite friends
        </h3>
        <p className="text-sm text-ink-muted">
          Share the link, league code, and join PIN in your group chat. Friends
          use Join on the home page.
        </p>
        <label className="block">
          <span className={labelClass}>League link</span>
          <div className="flex gap-2">
            <input readOnly className={inputClass} value={inviteUrl} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copyText("Link", inviteUrl)}
            >
              Copy
            </Button>
          </div>
        </label>
        <label className="block">
          <span className={labelClass}>League code</span>
          <div className="flex gap-2">
            <input readOnly className={inputClass} value={slug} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copyText("Code", slug)}
            >
              Copy
            </Button>
          </div>
        </label>

        {isAdmin ? (
          <>
            <label className="block">
              <span className={labelClass}>Join PIN</span>
              <div className="flex gap-2">
                <input readOnly className={inputClass} value={joinPin ?? "••••"} />
                {joinPin ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void copyText("Join PIN", joinPin)}
                  >
                    Copy
                  </Button>
                ) : null}
              </div>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                disabled={inviteLoading}
                onClick={() => void loadInvite(false)}
              >
                {inviteLoading ? "Loading…" : "Show join PIN"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                disabled={inviteLoading}
                onClick={() => void loadInvite(true)}
              >
                Regenerate PIN
              </Button>
            </div>
          </>
        ) : (
          <p className="rounded-xl bg-field px-3 py-2 text-xs text-ink-muted">
            Ask an admin for the join PIN.
          </p>
        )}
      </section>

      {/* A fieldset disables every control inside it, including the money form,
          which has no disabled prop of its own. */}
      <fieldset
        disabled={!isAdmin}
        className="m-0 min-w-0 space-y-5 border-0 p-0 disabled:opacity-60"
      >
        <label className="block">
          <span className={labelClass}>League name</span>
          <input
            className={inputClass}
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
          />
        </label>

        <div>
          <span className={labelClass}>What&apos;s in this league</span>
          <SectionToggles value={sections} onChange={setSections} disabled={!isAdmin} />
        </div>

        {sections.group_bets ? (
          <div>
            <span className={labelClass}>Group bets</span>
            <PickModeField value={pickMode} onChange={setPickMode} disabled={!isAdmin} />
          </div>
        ) : null}

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
          <span className={labelClass}>Pick lock type</span>
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
      </fieldset>

      {isAdmin ? (
        <>
          <Button type="submit" fullWidth disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>

          <Link
            href={`/${slug}/admin`}
            className="block rounded-xl border border-border bg-field px-4 py-3 text-center text-sm font-bold text-turf hover:bg-field-deep"
          >
            Open admin tools →
          </Link>

          <section className="space-y-3 rounded-2xl border border-danger/30 bg-chalk p-4">
            <h3 className="font-display text-base font-bold uppercase tracking-wide text-danger">
              Delete this league
            </h3>
            <p className="text-sm text-ink-muted">
              Every member, pick, parlay and ticket goes with it. There is no
              undo.
            </p>
            <Button
              type="button"
              variant="danger"
              fullWidth
              onClick={() => {
                setDeleteName("");
                setDeleteOpen(true);
              }}
            >
              Delete league…
            </Button>
          </section>
        </>
      ) : null}
    </form>

    <Sheet
      open={deleteOpen}
      onClose={() => setDeleteOpen(false)}
      title="Delete this league?"
      description={`Type the league's name — ${leagueName} — to confirm. Everyone loses access immediately.`}
    >
      <div className="space-y-3 pb-2">
        <input
          autoFocus
          className={inputClass}
          value={deleteName}
          placeholder={leagueName}
          autoComplete="off"
          onChange={(e) => setDeleteName(e.target.value)}
        />
        <Button
          type="button"
          variant="danger"
          fullWidth
          size="lg"
          disabled={deleting || deleteName.trim().toLowerCase() !== leagueName.trim().toLowerCase()}
          onClick={() => void onDelete()}
        >
          {deleting ? "Deleting…" : "Delete league for everyone"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => setDeleteOpen(false)}
        >
          Keep it
        </Button>
      </div>
    </Sheet>
    </>
  );
}
