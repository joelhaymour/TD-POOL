"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !displayName.trim()) {
      toast({
        title: "Missing fields",
        description: "Enter a league name and your display name.",
        tone: "error",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          admin_display_name: displayName.trim(),
          admin_pin: "1234",
          join_pin: "0000",
        }),
      });
      const data = (await res.json()) as { slug?: string; error?: string };
      if (!res.ok || !data.slug) {
        toast({
          title: "Could not create league",
          description: data.error ?? "Try a different name.",
          tone: "error",
        });
        return;
      }
      toast({ title: "League created", tone: "success" });
      router.push(`/${data.slug}`);
    } catch {
      toast({
        title: "Network error",
        description: "Check that the server is running.",
        tone: "error",
      });
    } finally {
      setLoading(false);
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

        <Link
          href="/joels-league"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-ink px-5 font-display text-sm font-bold uppercase tracking-wider text-lime transition hover:bg-ink/90"
        >
          Open demo league
        </Link>

        <form
          onSubmit={onSubmit}
          className="mt-10 space-y-3 rounded-2xl border border-border bg-chalk/90 p-4 shadow-card backdrop-blur-sm"
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
              className="h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
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
              className="h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
            />
          </label>
          <p className="text-[11px] text-ink-faint">
            Defaults: admin PIN 1234 · join PIN 0000
          </p>
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? "Creating…" : "Create league"}
          </Button>
        </form>
      </main>
    </div>
  );
}
