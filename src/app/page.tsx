"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  generateJoinPin,
  memberStorageKey,
  normalizeJoinSlug,
} from "@/lib/league/member-storage";

type CreatedLeague = {
  slug: string;
  name: string;
  join_pin: string;
  admin_member_id: string | null;
};

const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [mode, setMode] = useState<"create" | "join">("create");
  const [created, setCreated] = useState<CreatedLeague | null>(null);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinSlug, setJoinSlug] = useState("");
  const [joinPin, setJoinPin] = useState("");
  const [joinName, setJoinName] = useState("");
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
          admin_pin: "1234",
          join_pin: newJoinPin,
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

      if (data.admin_member_id) {
        window.localStorage.setItem(
          memberStorageKey(data.slug),
          data.admin_member_id,
        );
      }

      setCreated({
        slug: data.slug,
        name: data.name,
        join_pin: data.join_pin || newJoinPin,
        admin_member_id: data.admin_member_id,
      });
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
        member?: { id: string };
        league?: { slug: string };
      };
      if (!res.ok || !data.member?.id || !data.league?.slug) {
        toast({
          title: "Could not join",
          description: data.error ?? "Check the code and PIN.",
          tone: "error",
        });
        return;
      }

      window.localStorage.setItem(
        memberStorageKey(data.league.slug),
        data.member.id,
      );
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
      toast({
        title: "Copy failed",
        description: value,
        tone: "error",
      });
    }
  }

  return (
    <div className="field-atmosphere relative min-h-dvh">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 0%, rgba(184,242,74,0.28), transparent 45%), radial-gradient(ellipse at 90% 30%, rgba(31,138,76,0.22), transparent 50%)",
        }}
      />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-turf">
          Weekly anytime TD
        </p>
        <h1 className="mt-2 font-display text-6xl font-extrabold uppercase leading-[0.9] tracking-wide text-ink sm:text-7xl">
          TD POOL
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-ink-muted">
          One pick each week. Unique players. Parlay the board. Built for your
          group chat league.
        </p>

        {created ? (
          <section className="mt-8 space-y-3 rounded-2xl border border-border bg-chalk/90 p-4 shadow-card backdrop-blur-sm">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
              Invite your league
            </h2>
            <p className="text-sm text-ink-muted">
              Share the link and join PIN in your group chat. Keep the admin PIN
              to yourself (default 1234 — change later in settings).
            </p>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                League link
              </span>
              <div className="flex gap-2">
                <input
                  readOnly
                  className={inputClass}
                  value={inviteUrl || `/${created.slug}`}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void copyText("Link", inviteUrl || `/${created.slug}`)
                  }
                >
                  Copy
                </Button>
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                League code
              </span>
              <div className="flex gap-2">
                <input readOnly className={inputClass} value={created.slug} />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void copyText("Code", created.slug)}
                >
                  Copy
                </Button>
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                Join PIN
              </span>
              <div className="flex gap-2">
                <input
                  readOnly
                  className={inputClass}
                  value={created.join_pin}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void copyText("Join PIN", created.join_pin)}
                >
                  Copy
                </Button>
              </div>
            </label>
            <Button
              type="button"
              fullWidth
              onClick={() => router.push(`/${created.slug}`)}
            >
              Open {created.name}
            </Button>
          </section>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 gap-2 rounded-xl border border-border bg-chalk/70 p-1">
              <button
                type="button"
                className={`h-10 rounded-lg font-display text-xs font-bold uppercase tracking-wider transition ${
                  mode === "create"
                    ? "bg-ink text-lime"
                    : "text-ink-muted hover:text-ink"
                }`}
                onClick={() => setMode("create")}
              >
                Create
              </button>
              <button
                type="button"
                className={`h-10 rounded-lg font-display text-xs font-bold uppercase tracking-wider transition ${
                  mode === "join"
                    ? "bg-ink text-lime"
                    : "text-ink-muted hover:text-ink"
                }`}
                onClick={() => setMode("join")}
              >
                Join
              </button>
            </div>

            {mode === "create" ? (
              <form
                onSubmit={onCreate}
                className="mt-4 space-y-3 rounded-2xl border border-border bg-chalk/90 p-4 shadow-card backdrop-blur-sm"
              >
                <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                  Create a league
                </h2>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                    League name
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Sunday TD Club"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                    Your display name
                  </span>
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
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                    League code
                  </span>
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
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                    Join PIN
                  </span>
                  <input
                    value={joinPin}
                    onChange={(e) => setJoinPin(e.target.value)}
                    placeholder="4-digit PIN"
                    inputMode="numeric"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                    Your display name
                  </span>
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
          </>
        )}
      </main>
    </div>
  );
}
