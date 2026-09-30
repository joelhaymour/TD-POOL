"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ClipboardList, History, Layers } from "lucide-react";
import { tap, tick } from "@/lib/native/haptics";
import { cn } from "@/lib/utils/cn";
import type { BottomNavItem, SectionNav } from "@/components/layout/nav-items";

export type BottomNavProps = {
  basePath: string;
  items: BottomNavItem[];
  className?: string;
};

type IconProps = { className?: string };

/** Drawn to match the app's own line weight rather than a stock icon set. */
function CreateIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function TicketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 9a2 2 0 0 0 2-2V6h14v1a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2v1H5v-1a2 2 0 0 0-2-2z" />
      <path d="M9 10v4" />
    </svg>
  );
}

/** A stub with the tear line down it — a placed bet, not a slip being built. */
function StubIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" />
      <path d="M14 6v2M14 11v2M14 16v2" strokeDasharray="0 3.2" />
    </svg>
  );
}

function TrophyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
      <path d="M12 14v4M9 20h6" />
    </svg>
  );
}

const iconMap = {
  picks: Layers,
  create: CreateIcon,
  league: ClipboardList,
  slip: TicketIcon,
  ticket: StubIcon,
  history: History,
  board: TrophyIcon,
};

function activeIndex(items: BottomNavItem[], basePath: string, pathname: string): number {
  return items.findIndex(
    (item) => pathname === item.href || (item.href !== basePath && pathname.startsWith(item.href)),
  );
}

/**
 * The floating glass tab bar. A lens sits behind the current tab; put a
 * finger on the bar and slide, and the lens follows it tab to tab with a tick
 * at each, opening the one you let go on. The lens moves the moment you
 * choose, before the new screen has loaded.
 */
export function BottomNav({ basePath, items, className }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const current = activeIndex(items, basePath, pathname);
  const [chosen, setChosen] = useOptimistic(current);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startX: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  const shown = dragIndex ?? chosen;

  function indexAt(clientX: number): number {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect) return shown;
    const i = Math.floor(((clientX - rect.left) / rect.width) * items.length);
    return Math.min(items.length - 1, Math.max(0, i));
  }

  function go(index: number, slid: boolean) {
    const item = items[index];
    if (!item) return;
    if (index === current) {
      // Tapping the tab you're on scrolls it back to the top, like iOS.
      if (!slid) window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    tap();
    startTransition(() => {
      setChosen(index);
      router.push(item.href);
    });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, startX: e.clientX, moved: false };
    setDragIndex(indexAt(e.clientX));
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) > 6) d.moved = true;
    const i = indexAt(e.clientX);
    if (i !== dragIndex) {
      if (d.moved) tick();
      setDragIndex(i);
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragIndex(null);
    // The click that follows lands on whichever tab the finger started on;
    // the bar has already chosen, so let it go by.
    swallowClick.current = true;
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 400);
    go(indexAt(e.clientX), d.moved);
  }

  function onPointerCancel() {
    drag.current = null;
    setDragIndex(null);
  }

  return (
    <nav
      className={cn(
        "fixed inset-x-0 z-40 px-4",
        "bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)-0.625rem))]",
        className,
      )}
      aria-label="Primary"
    >
      <div
        ref={bar}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(e) => {
          if (swallowClick.current) {
            e.preventDefault();
            e.stopPropagation();
            swallowClick.current = false;
          }
        }}
        className="glass relative mx-auto grid max-w-md touch-none rounded-full p-1"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {shown >= 0 ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-1 left-1 rounded-full bg-white shadow-[0_1px_2px_rgba(18,23,15,0.08),0_4px_14px_-4px_rgba(18,23,15,0.18)] transition-[transform,scale] duration-[420ms] ease-[var(--spring)]",
              dragIndex != null && "scale-[1.07] bg-white/90",
            )}
            style={{
              width: `calc((100% - 0.5rem) / ${items.length})`,
              transform: `translateX(${shown * 100}%)`,
            }}
          />
        ) : null}
        {items.map((item, index) => {
          const Icon = iconMap[item.icon];
          const active = index === shown;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={index === current ? "page" : undefined}
              draggable={false}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-full px-1 pb-1.5 pt-2 text-[10.5px] font-semibold transition-colors duration-200",
                active ? "text-turf" : "text-ink-muted",
              )}
            >
              <span className="relative">
                <Icon
                  className={cn(
                    "h-[22px] w-[22px] transition-transform duration-300 ease-[var(--spring)]",
                    active && "scale-110 stroke-[2.25]",
                  )}
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 font-display text-[10px] font-bold text-accent-fg">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The bar for whichever section the reader is in. Sections live under
 * `/<slug>/<section>`, so the second path segment picks the bar; league-level
 * pages (settings, admin) keep the last section's bar so nothing jumps.
 */
export function LeagueNav({
  slug,
  navs,
}: {
  slug: string;
  navs: SectionNav[];
}) {
  const pathname = usePathname();
  const segment = pathname.split("/")[2];
  const nav = navs.find((n) => n.path === segment) ?? navs[0];
  if (!nav) return null;
  void slug;
  return <BottomNav basePath={nav.basePath} items={nav.items} />;
}
