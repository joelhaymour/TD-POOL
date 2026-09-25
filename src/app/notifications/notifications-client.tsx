"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BellOff, BellRing, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { NOTIFY_KINDS, NOTIFY_KIND_KEYS, type NotifyKind, type NotifyPrefs } from "@/lib/notify/kinds";
import { detectPushSupport, disablePush, enablePush, pushIsOn, type PushSupport } from "@/lib/push/client";
import { cn } from "@/lib/utils/cn";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function NotificationsClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs>({});
  // Known only in the browser; the server render says "unsupported".
  const support = useSyncExternalStore<PushSupport>(
    noopSubscribe,
    detectPushSupport,
    () => "unsupported",
  );
  const [pushOn, setPushOn] = useState(false);
  const [working, setWorking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [list, p] = await Promise.all([
        fetch("/api/notifications", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/notifications/prefs", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (!alive) return;
      setItems((list.items as Item[]) ?? []);
      setPrefs((p.prefs as NotifyPrefs) ?? {});
      // Opening the inbox reads it.
      if ((list.unread as number) > 0) void fetch("/api/notifications", { method: "POST", body: "{}" });
    })();
    void pushIsOn().then((on) => alive && setPushOn(on)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function togglePref(kind: NotifyKind) {
    const next = { ...prefs, [kind]: prefs[kind] === false };
    setPrefs(next);
    const res = await fetch("/api/notifications/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      setPrefs(prefs);
      toast({ title: "Couldn't save", tone: "error" });
    }
  }

  async function turnOn() {
    setWorking(true);
    try {
      const result = await enablePush();
      if (result.ok) {
        setPushOn(true);
        toast({ title: "Notifications on", description: "This device will buzz for your leagues.", tone: "success" });
      } else {
        toast({ title: "Not yet", description: result.message, tone: "error" });
      }
    } finally {
      setWorking(false);
    }
  }

  async function turnOff() {
    setWorking(true);
    try {
      await disablePush();
      setPushOn(false);
    } finally {
      setWorking(false);
    }
  }

  const today = (items ?? []).filter((i) => isToday(i.created_at));
  const earlier = (items ?? []).filter((i) => !isToday(i.created_at));

  const list = (group: Item[], label: string) =>
    group.length > 0 ? (
      <section>
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-chalk shadow-card">
          {group.map((n) => (
            <li key={n.id}>
              <Link href={n.url || "/"} className="flex gap-3 px-3.5 py-3 transition active:bg-field-deep">
                <span
                  aria-hidden
                  className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-lime")}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-bold uppercase tracking-wider text-ink-faint">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-ink-faint">{ago(n.created_at)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-ink">{n.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="field-atmosphere min-h-dvh">
      <main className="mx-auto w-full max-w-lg px-4 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.5rem))] pt-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))]">
        <header className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Back"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-chalk text-ink transition active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <h1 className="flex-1 font-display text-xl font-extrabold uppercase tracking-wide text-ink">Notifications</h1>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className="h-10 rounded-xl border border-border bg-chalk px-3 text-xs font-bold uppercase tracking-wider text-ink-muted"
          >
            Settings
          </button>
        </header>

        {settingsOpen || (support !== "unsupported" && !pushOn && items !== null && items.length === 0) ? (
          <section className="mt-4 space-y-3 rounded-2xl border border-border bg-chalk p-4 shadow-card">
            <div className="flex items-start gap-3">
              {pushOn ? (
                <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-turf" aria-hidden />
              ) : (
                <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {pushOn ? "Push is on for this device" : "Get these on your lock screen"}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {support === "ios-install"
                    ? "On iPhone, add Pool’d to your Home Screen first (Share › Add to Home Screen)."
                    : support === "unsupported"
                      ? "This browser can't show notifications. Your inbox here still gets everything."
                      : pushOn
                        ? "Turn it off here any time."
                        : "Tickets hitting, rides, pick reminders: straight to this device."}
                </p>
              </div>
            </div>
            {support === "native" || support === "web" ? (
              pushOn && support === "web" ? (
                <Button type="button" variant="secondary" fullWidth disabled={working} onClick={() => void turnOff()}>
                  Turn off on this device
                </Button>
              ) : !pushOn ? (
                <Button type="button" fullWidth disabled={working} onClick={() => void turnOn()}>
                  {working ? "Turning on…" : "Turn on notifications"}
                </Button>
              ) : null
            ) : null}

            {settingsOpen ? (
              <ul className="divide-y divide-border border-t border-border pt-1">
                {NOTIFY_KIND_KEYS.map((kind) => {
                  const on = prefs[kind] !== false;
                  return (
                    <li key={kind} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">{NOTIFY_KINDS[kind].label}</p>
                        <p className="text-xs text-ink-muted">{NOTIFY_KINDS[kind].detail}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={NOTIFY_KINDS[kind].label}
                        onClick={() => void togglePref(kind)}
                        className={cn(
                          "relative h-7 w-12 shrink-0 rounded-full transition",
                          on ? "bg-lime" : "bg-border-strong",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
                            on ? "left-[1.375rem]" : "left-0.5",
                          )}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        ) : null}

        <div className="mt-5 space-y-5">
          {items === null ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-ink-muted">
              Nothing yet. When someone posts a ticket, rides yours, or a leg you follow hits, it lands here.
            </p>
          ) : (
            <>
              {list(today, "Today")}
              {list(earlier, "Earlier")}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const noopSubscribe = () => () => {};
