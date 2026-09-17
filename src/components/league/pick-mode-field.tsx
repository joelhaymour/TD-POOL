"use client";

import { cn } from "@/lib/utils/cn";
import type { PickMode } from "@/lib/types";

const MODES: { id: PickMode; title: string; hint: string }[] = [
  {
    id: "one_each",
    title: "One pick each",
    hint: "Everyone makes one pick. The slip locks itself once the last person is in.",
  },
  {
    id: "open",
    title: "Open slip",
    hint: "Add as many picks as you like. Whoever places the bet taps Lock in bet.",
  },
];

/** How a group slip fills — the one group-bets setting a league has. */
export function PickModeField({
  value,
  onChange,
  disabled,
}: {
  value: PickMode;
  onChange: (next: PickMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      {MODES.map((mode) => {
        const selected = value === mode.id;
        return (
          <label
            key={mode.id}
            className={cn(
              "flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition",
              selected
                ? "border-turf bg-turf/8"
                : "border-border bg-chalk hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              name="pick_mode"
              className="mt-1 accent-turf"
              checked={selected}
              onChange={() => onChange(mode.id)}
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{mode.title}</span>
              <span className="block text-xs text-ink-muted">{mode.hint}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
