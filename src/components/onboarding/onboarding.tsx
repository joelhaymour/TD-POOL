"use client";

import { useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bell, BellRing, Check, Flame, TicketCheck, Trophy, UserPlus, Users } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { tap } from "@/lib/native/haptics";
import { detectPushSupport, enablePush } from "@/lib/push/client";

const SEEN_KEY = "poold:onboarded";

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // No storage (private mode): don't trap anyone in the tour every visit.
    return true;
  }
}

const noopSubscribe = () => () => {};

/** Delay helper for the demo pieces. */
const at = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

/**
 * The first-run tour: what Pool’d is, picking a TD player, posting a bet,
 * riding and following along — then the notifications ask. Shown once per
 * device; finishing or skipping remembers it.
 */
export function Onboarding() {
  // Server render and first paint say "seen", so nothing flashes for people
  // who have done the tour; the real answer arrives right after hydration.
  const seen = useSyncExternalStore(noopSubscribe, readSeen, () => true);
  const [closed, setClosed] = useState(false);
  const [index, setIndex] = useState(0);
  const [asking, setAsking] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  if (seen || closed) return null;

  const support = detectPushSupport();
  const canPush = support === "native" || support === "web";

  function finish() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to remember it in; closing still works for this visit.
    }
    setClosed(true);
  }

  function go(to: number) {
    const el = track.current;
    if (!el) return;
    tap();
    el.scrollTo({ left: to * el.clientWidth, behavior: "smooth" });
  }

  async function turnOn() {
    setAsking(true);
    try {
      await enablePush();
    } finally {
      setAsking(false);
      finish();
    }
  }

  const slides: { key: string; title: string; body: string; demo: ReactNode }[] = [
    {
      key: "welcome",
      title: "Welcome to Pool’d",
      body: "Your group’s weekly touchdown pool and every bet you place, followed live in one place.",
      demo: <WelcomeDemo />,
    },
    {
      key: "pick",
      title: "Pick a player each week",
      body: "Everyone picks one player to score a touchdown. All the picks together make the league’s parlay.",
      demo: <PickDemo />,
    },
    {
      key: "post",
      title: "Post your bets",
      body: "Share a slip from your sportsbook straight to Pool’d. It reads the legs and odds, so you just tap Post.",
      demo: <PostDemo />,
    },
    {
      key: "ride",
      title: "Ride along with friends",
      body: "Ride or follow a friend’s ticket and watch every leg fill in as the games are played.",
      demo: <RideDemo />,
    },
    {
      key: "notify",
      title: "Know the moment it hits",
      body: canPush
        ? "Turn on notifications so Pool’d can tell you when:"
        : "Get Pool’d on your iPhone and turn on notifications to hear when:",
      demo: <NotifyDemo />,
    },
  ];
  const last = slides.length - 1;

  // Into <body>: the home screen fades in with a transform, which would
  // otherwise pin this full-screen layer inside it.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Pool’d"
      className="fixed inset-0 z-[70] flex flex-col bg-field animate-fade-in"
    >
      <div className="flex justify-end px-5 pt-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))]">
        {index < last ? (
          <button type="button" onClick={finish} className="h-9 px-2 text-sm font-medium text-ink-muted">
            Skip
          </button>
        ) : (
          <span className="h-9" />
        )}
      </div>

      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) setIndex(i);
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <section
            key={slide.key}
            aria-hidden={i !== index}
            className="flex w-full shrink-0 snap-center flex-col items-center px-6"
          >
            {/* Remounting on arrival replays the demo each time. */}
            <div className="flex w-full max-w-sm flex-1 items-center justify-center py-4">
              {i === index ? slide.demo : null}
            </div>
            <div className="w-full max-w-sm pb-4 text-center">
              <h2 className="text-[26px] font-bold leading-tight tracking-tight text-ink">{slide.title}</h2>
              <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-ink-muted">{slide.body}</p>
              {slide.key === "notify" ? <NotifyList /> : null}
            </div>
          </section>
        ))}
      </div>

      <div className="mx-auto w-full max-w-sm px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex justify-center gap-1.5" aria-hidden>
          {slides.map((slide, i) => (
            <span
              key={slide.key}
              className={
                i === index
                  ? "h-1.5 w-5 rounded-full bg-ink transition-all duration-300"
                  : "h-1.5 w-1.5 rounded-full bg-ink/20 transition-all duration-300"
              }
            />
          ))}
        </div>
        {index < last ? (
          <Button size="lg" fullWidth onClick={() => go(index + 1)}>
            {index === 0 ? "Show me how" : "Next"}
          </Button>
        ) : canPush ? (
          <>
            <Button size="lg" fullWidth disabled={asking} onClick={() => void turnOn()}>
              {asking ? "Turning on…" : "Turn on notifications"}
            </Button>
            <button type="button" onClick={finish} className="mt-2 h-10 w-full text-sm font-medium text-ink-muted">
              Not now
            </button>
          </>
        ) : (
          <Button size="lg" fullWidth onClick={finish}>
            Let’s go
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* The demos: small, true-to-the-app scenes that play once. */

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-full max-w-[18rem] overflow-hidden rounded-[2rem] bg-white/70 p-3.5 shadow-[var(--glass-shadow)] backdrop-blur-xl">
      {children}
    </div>
  );
}

function Finger({ style, className }: { style?: CSSProperties; className?: string }) {
  return (
    <span
      aria-hidden
      className={`ob-tap pointer-events-none absolute h-9 w-9 rounded-full bg-ink/25 ring-4 ring-white/70 ${className ?? ""}`}
      style={style}
    />
  );
}

function WelcomeDemo() {
  return (
    <div className="flex flex-col items-center">
      <span className="ob-pop flex h-28 w-28 items-center justify-center rounded-[2rem] bg-[#fbf8f2] shadow-[var(--glass-shadow)]">
        <LogoMark className="h-16 w-16 text-ink" />
      </span>
      <div className="mt-6 flex gap-2">
        {[
          [Trophy, "TD pool", 0.5],
          [TicketCheck, "Tickets", 0.65],
          [Users, "Friends", 0.8],
        ].map(([Icon, label, delay]) => {
          const I = Icon as typeof Trophy;
          return (
            <span
              key={label as string}
              className="ob-in flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-ink shadow-card"
              style={at(delay as number)}
            >
              <I className="h-4 w-4" aria-hidden /> {label as string}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PickDemo() {
  const players = [
    ["Derrick Henry", "RB · BAL", "−245"],
    ["Ja’Marr Chase", "WR · CIN", "+140"],
    ["Travis Kelce", "TE · KC", "+190"],
  ];
  return (
    <Phone>
      <p className="px-1 text-[11px] font-medium text-ink-muted">Week 4 · Your pick</p>
      <ul className="mt-2 space-y-2">
        {players.map(([name, detail, odds], i) => (
          <li
            key={name}
            className="ob-in relative flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 shadow-card"
            style={at(0.15 + i * 0.12)}
          >
            {i === 1 ? (
              <span
                aria-hidden
                className="ob-in absolute inset-0 rounded-2xl ring-2 ring-lime"
                style={at(1.25)}
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{name}</span>
              <span className="block text-[11px] text-ink-muted">{detail}</span>
            </span>
            <span className="font-display text-sm font-bold text-ink">{odds}</span>
            {i === 1 ? <Finger className="right-10 top-2" style={at(0.9)} /> : null}
          </li>
        ))}
      </ul>
      <div
        className="ob-pop mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full bg-lime px-3.5 py-1.5 text-[13px] font-semibold text-accent-fg"
        style={at(1.6)}
      >
        <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> Pick locked in
      </div>
    </Phone>
  );
}

function PostDemo() {
  return (
    <Phone>
      <p className="px-1 text-[11px] font-medium text-ink-muted">Share from your sportsbook</p>
      <div className="relative mt-2 flex gap-3 rounded-2xl bg-white p-3 shadow-card">
        {[
          ["Messages", "bg-[#34c759]", ""],
          ["Mail", "bg-[#1e88e5]", ""],
          ["Pool’d", "bg-[#fbf8f2]", "logo"],
          ["Notes", "bg-[#ffd60a]", ""],
        ].map(([label, color, kind]) => (
          <span key={label} className="flex w-12 flex-col items-center gap-1">
            <span className={`flex h-11 w-11 items-center justify-center rounded-[0.8rem] shadow-sm ${color}`}>
              {kind === "logo" ? <LogoMark className="h-7 w-7 text-ink" /> : null}
            </span>
            <span className="text-[10px] text-ink-muted">{label}</span>
          </span>
        ))}
        <Finger className="left-[7.6rem] top-3.5" style={at(0.5)} />
      </div>
      <div className="ob-in mt-3 rounded-2xl bg-white p-3 shadow-card" style={at(1.2)}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-ink">Your ticket</span>
          <span className="rounded-md bg-[#0f7a3d] px-1.5 py-0.5 text-[9px] font-bold text-white">bet365</span>
        </div>
        {["Josh Allen · Anytime TD", "James Cook · Anytime TD", "Bills ML"].map((leg, i) => (
          <p key={leg} className="ob-in mt-1.5 text-xs text-ink-muted" style={at(1.5 + i * 0.15)}>
            {leg}
          </p>
        ))}
        <div className="ob-in mt-2.5 flex items-baseline justify-between" style={at(2)}>
          <span className="font-display text-xl font-bold text-ink">+650</span>
          <span className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-accent-fg">Post</span>
        </div>
      </div>
    </Phone>
  );
}

function RideDemo() {
  const legs = ["Allen", "Kelce", "Cook", "Pacheco"];
  return (
    <div className="relative w-full max-w-[18rem]">
      <div
        className="ob-drop absolute inset-x-0 -top-14 z-10 flex items-center gap-2.5 rounded-2xl bg-white/90 p-2.5 shadow-[var(--glass-shadow)] backdrop-blur-xl"
        style={at(2.6)}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.6rem] bg-[#fbf8f2]">
          <LogoMark className="h-5 w-5 text-ink" />
        </span>
        <span className="min-w-0 text-[11px] leading-snug text-ink">
          <b>Mike just hit 3 of 4.</b> 1 more for $775
        </span>
      </div>
      <Phone>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-field-deep text-[10px] font-bold text-ink-muted">
            MC
          </span>
          <span className="flex-1 text-sm font-semibold text-ink">Mike Carter</span>
          <span className="flex items-center gap-1 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10px] font-semibold text-ink">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> Live
          </span>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          <span className="font-display text-2xl font-bold text-ink">+1450</span> $50 to win{" "}
          <b className="text-ink">$775</b>
        </p>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {legs.map((leg, i) => (
            <div key={leg}>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                {i < 3 ? <div className="ob-fill h-full rounded-full bg-lime" style={at(0.8 + i * 0.6)} /> : null}
              </div>
              <p className="mt-1 text-[9px] text-ink-muted">{leg}</p>
            </div>
          ))}
        </div>
        <div className="relative mt-3 flex gap-1.5">
          <span className="relative flex h-7 items-center gap-1 rounded-full bg-ink/[0.06] px-2.5 text-[11px] font-semibold text-ink-muted">
            <Users className="h-3 w-3" aria-hidden /> Ride
            <span
              className="ob-pop absolute inset-0 flex items-center justify-center gap-1 rounded-full bg-ink text-white"
              style={at(0.55)}
            >
              <Users className="h-3 w-3" aria-hidden /> Riding
            </span>
          </span>
          <span className="flex h-7 items-center gap-1 rounded-full bg-ink/[0.06] px-2.5 text-[11px] font-semibold text-ink-muted">
            <Bell className="h-3 w-3" aria-hidden /> Follow
          </span>
          <Finger className="-left-1 -top-1" style={at(0.2)} />
        </div>
      </Phone>
    </div>
  );
}

function NotifyDemo() {
  return (
    <span className="ob-pop flex h-24 w-24 items-center justify-center rounded-[1.8rem] bg-white shadow-[var(--glass-shadow)]">
      <BellRing className="ob-ring h-11 w-11 text-ink" aria-hidden />
    </span>
  );
}

function NotifyList() {
  const items: [typeof Bell, string][] = [
    [TicketCheck, "A friend posts a ticket in your league"],
    [Flame, "A leg hits on a ticket you ride or follow"],
    [Trophy, "Tickets win or lose, and when all picks are in"],
    [UserPlus, "Someone joins your league or rides your ticket"],
    [Bell, "It’s time to make your pick"],
  ];
  return (
    <ul className="mx-auto mt-4 max-w-xs space-y-2 text-left">
      {items.map(([Icon, text], i) => (
        <li key={text} className="ob-in flex items-center gap-2.5 text-sm text-ink" style={at(0.2 + i * 0.1)}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-card">
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}
