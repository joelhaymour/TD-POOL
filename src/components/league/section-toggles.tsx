"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SECTIONS } from "@/lib/league/sections";
import type { LeagueSection, LeagueSections } from "@/lib/types";

/**
 * Which sections a league runs, as tappable cards. The last one on cannot be
 * switched off — a league has to be something.
 */
export function SectionToggles({
  value,
  onChange,
  disabled,
  hidden = [],
}: {
  value: LeagueSections;
  onChange: (next: LeagueSections) => void;
  disabled?: boolean;
  /** Sections this screen leaves out (group bets in the iOS app). */
  hidden?: readonly LeagueSection[];
}) {
  const shown = SECTIONS.filter((s) => !hidden.includes(s.key));
  const onCount = shown.filter((s) => value[s.key]).length;
  return (
    <div className="grid grid-cols-1 gap-2">
      {shown.map((section) => {
        const on = value[section.key];
        const lastOn = on && onCount === 1;
        return (
          <button
            key={section.key}
            type="button"
            role="switch"
            aria-checked={on}
            disabled={disabled || lastOn}
            title={lastOn ? "A league needs at least one section" : undefined}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-default",
              on
                ? "border-ink bg-chalk shadow-card"
                : "border-border bg-transparent hover:border-border-strong",
            )}
            onClick={() => onChange({ ...value, [section.key]: !on })}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                on ? "border-ink bg-ink text-on-ink" : "border-border-strong",
              )}
              aria-hidden
            >
              {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {section.label}
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {section.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
