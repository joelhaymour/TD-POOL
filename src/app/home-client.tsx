"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { generateJoinPin, normalizeJoinSlug } from "@/lib/league/join";

type CreatedLeague = {
  slug: string;
  name: string;
  join_pin: string;
};

const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";

const labelClass =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint";

export function HomeClient({
  accountName,
  hasLeagues,
  pendingJoinSlug,
}: {
  accountName: string;
  hasLeagues: boolean;
  /** Non-empty when an invite link bounced the user here to join first. */
  pendingJoinSlug: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  // People who already have leagues land on the list, not a form — unless they
  // arrived from an invite link, which needs the join form open and filled in.
  const [open, setOpen] = useState(!hasLeagues || Boolean(pendingJoinSlug));
  const [mode, setMode] = useState<"create" | "join">(
    pendingJoinSlug ? "join" : "create",
  );
  const [created, setCreated] = useState<CreatedLeague | null>(null);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState(accountName);
  const [leagueType, setLeagueType] = useState<"td_pool" | "group_betting">(
    "td_pool",
  );
  const [maxProps, setMaxProps] = useState("3");
  const [creating, setCreating] = useState(false);

  const [joinSlug, setJoinSlug] = useState(pendingJoinSlug);
  const [joinPin, setJoinPin] = useState("");
  const [joinName, setJoinName] = useState(accountName);
  const [joining, setJoining] = useState(false);

  const inviteUrl = useMemo(() => {
    if (!created || typeof window === "undefined") return "";
    return `${window.location.origin}/${created.slug}`;
  }, [created]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !displayName.trim()) {
      toast({
        title: "Missing fields",
        description: "Enter a league name and your display name.",
        tone: "error",
      });
      return;
    }

    const newJoinPin = generateJoinPin();
    setCreating(true);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          admin_display_name: displayName.trim(),
          join_pin: newJoinPin,
          league_type: leagueType,
          max_props_per_member:
            leagueType === "group_betting"
              ? Math.min(25, Math.max(1, Number(maxProps) || 3))
              : undefined,
        }),
      });
      const data = (await res.json()) as CreatedLeague & { error?: string };
      if (!res.ok || !data.slug) {
        toast({
          title: "Could not create league",
          description: data.error ?? "Try a different name.",
          tone: "error",
        });
        return;
      }

      setCreated({
        slug: data.slug,
        name: data.name,
        join_pin: data.join_pin || newJoinPin,
      });
      router.refresh();
      toast({ title: "League created", tone: "success" });
    } catch {
      toast({
        title: "Network error",
        description: "Check that the server is running.",
        tone: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    const slug = normalizeJoinSlug(joinSlug);
    if (!slug || !joinPin.trim() || !joinName.trim()) {
      toast({
        title: "Missing fields",
        description: "Enter league code, join PIN, and your display name.",
        tone: "error",
      });
      return;
    }

    setJoining(true);
    try {
      const res = await fetch(`/api/leagues/${encodeURIComponent(slug)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: joinName.trim(),
          joinPin: joinPin.trim(),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        league?: { slug: string };
      };
      if (!res.ok || !data.league?.slug) {
        toast({
          title: "Could not join",
          description: data.error ?? "Check the code and PIN.",
          tone: "error",
        });
        return;
      }

      toast({ title: "You're in", tone: "success" });
      router.push(`/${data.league.slug}`);
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setJoining(false);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied`, tone: "success" });
    } catch {
      toast({ title: "Copy failed", description: value, tone: "error" });
    }
  }

  if (created) {
    return (
      <section className="mt-6 space-y-3 rounded-2xl border border-border bg-chalk/90 p-4 shadow-card backdrop-blur-sm">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
          Invite your league
        </h2>
        <p className="text-sm text-ink-muted">
          Share the link and join PIN in your group chat. Everyone signs in with
          their own account, so nobody loses their picks.
        </p>
        {(
          [
            ["League link", inviteUrl || `/${created.slug}`],
            ["League code", created.slug],
            ["Join PIN", created.join_pin],
          ] as const
        ).map(([label, value]) => (
          <label key={label} className="block">
            <span className={labelClass}>{label}</span>
            <div className="flex gap-2">
              <input readOnly className={inputClass} value={value} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copyText(label, value)}
              >
                Copy
              </Button>
            </div>
          </label>
        ))}
        <Button
          type="button"
          fullWidth
          onClick={() => router.push(`/${created.slug}`)}
        >
          Open {created.name}
        </Button>
      </section>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        fullWidth
        className="mt-4"
        onClick={() => setOpen(true)}
      >
        Create or join another league
      </Button>
    );
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-border bg-chalk/70 p-1">
        {(["create", "join"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`h-10 rounded-lg font-display text-xs font-bold uppercase tracking-wider transition ${
              mode === value
                ? "bg-ink text-lime"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => setMode(value)}
          >
            {value === "create" ? "Create" : "Join"}
          </button>
        ))}
      </div>

      {mode === "create" ? (
        <form
          onSubmit={onCreate}
          className="mt-4 space-y-3 rounded-2xl border border-border bg-chalk/90 p-4 shadow-card backdrop-blur-sm"
        >
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
            Create a league
          </h2>
          <div>
            <span className={labelClass}>League type</span>
            <div className="grid grid-cols-1 gap-2">
              {(
                [
                  {
                    value: "td_pool",
                    title: "Weekly TD Pool",
                    blurb:
                      "Everyone picks one player to score a TD each week. The classic.",
                  },
                  {
                    value: "group_betting",
                    title: "Group Betting",
                    blurb:
                      "Build shared parlays from every prop — TDs, yards, spreads — then open the slip in FanDuel.",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-xl border p-3 text-left transition ${
                    leagueType === option.value
                      ? "border-turf bg-turf/10 ring-2 ring-turf/20"
                      : "border-border-strong bg-field hover:border-turf"
                  }`}
                  onClick={() => setLeagueType(option.value)}
                >
                  <span className="block font-display text-sm font-bold uppercase tracking-wide text-ink">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {option.blurb}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {leagueType === "group_betting" ? (
            <label className="block">
              <span className={labelClass}>Picks per member, per slip</span>
              <input
                value={maxProps}
                onChange={(e) => setMaxProps(e.target.value)}
                inputMode="numeric"
                placeholder="3"
                className={inputClass}
              />
            </label>
          ) : null}
          <label className="block">
            <span className={labelClass}>League name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunday TD Club"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Your display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Joel"
              className={inputClass}
            />
          </label>
          <Button type="submit" fullWidth disabled={creating}>
            {creating ? "Creating…" : "Create league"}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={onJoin}
          className="mt-4 space-y-3 rounded-2xl border border-border bg-chalk/90 p-4 shadow-card backdrop-blur-sm"
        >
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
            Join a league
          </h2>
          <label className="block">
            <span className={labelClass}>League code</span>
            <input
              value={joinSlug}
              onChange={(e) => setJoinSlug(e.target.value)}
              placeholder="sunday-td-club"
              className={inputClass}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Join PIN</span>
            <input
              value={joinPin}
              onChange={(e) => setJoinPin(e.target.value)}
              placeholder="4-digit PIN"
              inputMode="numeric"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Your display name</span>
            <input
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Alex"
              className={inputClass}
            />
          </label>
          <Button type="submit" fullWidth disabled={joining}>
            {joining ? "Joining…" : "Join league"}
          </Button>
        </form>
      )}

      {hasLeagues ? (
        <button
          type="button"
          className="mt-3 block w-full text-center text-xs font-bold uppercase tracking-wider text-ink-faint hover:text-ink"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      ) : null}
    </>
  );
}
