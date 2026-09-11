"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatAmerican } from "@/lib/utils/odds";
import { gameStarted } from "@/lib/props/slip";
import { actualLabel, gameLabel, legTitle, RESULT_META } from "@/lib/props/format";
import type { LegResult, NflGame, ParlayLeg } from "@/lib/types";

const GRADE_OPTIONS: Array<[LegResult | "auto", string]> = [
  ["auto", "Auto grade"],
  ["won", "Hit"],
  ["lost", "Miss"],
  ["push", "Push"],
  ["void", "Void"],
];

export function LegRow({
  leg,
  game,
  onRemove,
  onGrade,
}: {
  leg: ParlayLeg;
  game: NflGame | undefined;
  /** Present when the viewer may take this leg off the slip. */
  onRemove?: () => void;
  /** Present for admins once the leg's game has started. */
  onGrade?: (result: LegResult | "auto") => void;
}) {
  const started = gameStarted(game);
  const actual = actualLabel(leg);
  const meta = RESULT_META[leg.result];
  const detail = [leg.market_label, gameLabel(game), actual]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-start gap-2.5 py-2">
      <span
        className="mt-0.5 flex w-5 shrink-0 justify-center text-sm leading-5"
        aria-label={leg.result === "pending" && started ? "Live" : meta.label}
      >
        {leg.result !== "pending" ? (
          meta.icon
        ) : started ? (
          <span className="mt-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-turf" />
        ) : (
          <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-ink/25" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-semibold",
            leg.result === "lost" ? "text-ink-faint line-through" : "text-ink",
          )}
        >
          {legTitle(leg)}
        </p>
        <p className="truncate text-[11px] uppercase tracking-wide text-ink-faint">
          {detail}
        </p>
        {onGrade ? (
          <select
            aria-label="Grade this leg"
            className="mt-1 rounded-md border border-border bg-field px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted"
            value={leg.manual_result ? leg.result : "auto"}
            onChange={(e) => onGrade(e.target.value as LegResult | "auto")}
          >
            {GRADE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <span className="shrink-0 pt-0.5 font-display text-sm font-bold text-ink">
        {formatAmerican(leg.american_odds)}
      </span>
      {onRemove ? (
        <button
          type="button"
          className="-mr-1 shrink-0 rounded-lg p-1 text-ink-faint hover:text-danger"
          aria-label="Remove pick"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </li>
  );
}
