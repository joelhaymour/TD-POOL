"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";
import { formatAmerican } from "@/lib/utils/odds";
import {
  buildFanduelLegUrl,
  buildFanduelParlayUrl,
  FANDUEL_STATES,
  fanduelStateName,
} from "@/lib/props/fanduel-link";
import { legTitle } from "@/lib/props/format";
import type { ParlayLeg } from "@/lib/types";

// The state is where this device bets from, so it lives on the device.
const STORAGE_KEY = "tdpool:fanduel-state";
const listeners = new Set<() => void>();

function readState(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeState(code: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const ctaClass =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime font-display text-sm font-extrabold uppercase tracking-wider text-ink shadow-sm transition active:scale-[0.98]";

/**
 * "Open in FanDuel" for a slip. Links go straight to the bettor's state
 * subdomain — without one FanDuel shows a state picker first, which is where
 * multi-leg selections were getting lost. Anchors rather than window.open so
 * the tap counts as a user navigation and iOS hands it to the FanDuel app.
 */
export function FanduelLauncher({ legs }: { legs: ParlayLeg[] }) {
  const state = useSyncExternalStore(subscribe, readState, () => null);
  const [sheet, setSheet] = useState<null | "state" | "legs">(null);
  const link = buildFanduelParlayUrl(legs, state);
  const stateName = fanduelStateName(state);

  if (legs.length === 0) {
    return (
      <p className="text-center text-xs text-chalk/55">
        Add picks and the FanDuel button lights up.
      </p>
    );
  }
  if (!link.url) {
    return (
      <p className="text-center text-xs text-chalk/55">
        None of these picks can be prefilled on FanDuel.
      </p>
    );
  }

  return (
    <>
      {stateName ? (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={ctaClass}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Open in FanDuel
        </a>
      ) : (
        <button type="button" className={ctaClass} onClick={() => setSheet("state")}>
          <ExternalLink className="h-4 w-4" aria-hidden />
          Open in FanDuel
        </button>
      )}

      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium text-chalk/55">
        <button
          type="button"
          className="underline-offset-2 hover:text-chalk hover:underline"
          onClick={() => setSheet("state")}
        >
          {stateName ? `FanDuel ${stateName} · change` : "Choose your state"}
        </button>
        <button
          type="button"
          className="underline-offset-2 hover:text-chalk hover:underline"
          onClick={() => setSheet("legs")}
        >
          Add one at a time
        </button>
      </div>
      {link.unmatched.length > 0 ? (
        <p className="mt-1.5 text-[11px] text-chalk/55">
          {link.unmatched.length} pick{link.unmatched.length === 1 ? "" : "s"}{" "}
          can&apos;t be prefilled — add {link.unmatched.length === 1 ? "it" : "them"} in
          FanDuel by hand.
        </p>
      ) : null}

      <Sheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        title={sheet === "legs" ? "One at a time" : "Where are you betting?"}
        description={
          sheet === "legs"
            ? "FanDuel keeps your betslip as you go: tap a pick, come back, tap the next."
            : "FanDuel runs a separate site per state. Saved on this device."
        }
      >
        {sheet === "state" ? (
          <div className="grid grid-cols-2 gap-2 pb-2">
            {FANDUEL_STATES.map((s) => (
              <button
                key={s.code}
                type="button"
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition",
                  s.code === state
                    ? "border-turf bg-turf/10 text-ink"
                    : "border-border bg-field text-ink hover:border-turf",
                )}
                onClick={() => {
                  writeState(s.code);
                  setSheet(null);
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : (
          <ol className="space-y-2 pb-2">
            {link.matched.map((leg, i) => (
              <li key={leg.id}>
                <a
                  href={buildFanduelLegUrl(leg, state) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-border bg-field px-3 py-2.5 transition hover:border-turf"
                >
                  <span className="w-4 font-display text-sm font-bold text-ink-faint">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {legTitle(leg)}
                    </span>
                    <span className="block text-[11px] uppercase tracking-wide text-ink-faint">
                      {leg.market_label}
                    </span>
                  </span>
                  <span className="font-display text-sm font-bold text-turf">
                    {formatAmerican(leg.american_odds)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
                </a>
              </li>
            ))}
          </ol>
        )}
      </Sheet>
    </>
  );
}
