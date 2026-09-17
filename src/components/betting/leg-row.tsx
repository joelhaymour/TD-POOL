"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { gameStarted } from "@/lib/props/slip";
import {
  actualLabel,
  gameLabel,
  legPrice,
  legTitle,
  RESULT_META,
} from "@/lib/props/format";
import { MemberChip, ResultMark } from "@/components/ui/result-mark";
import { LegLineProgress, hasLineProgress } from "@/components/betting/leg-line-progress";
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
  memberName,
  onRemove,
  onGrade,
}: {
  leg: ParlayLeg;
  game: NflGame | undefined;
  /** Whose pick this is — shown as initials. */
  memberName?: string;
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
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border px-3 py-2.5",
        leg.result === "won"
          ? "border-lime/30 bg-lime/[0.07]"
          : leg.result === "lost"
            ? "border-danger/25 bg-danger/[0.06]"
            : "border-border bg-chalk",
      )}
    >
      <span
        className="flex w-5 shrink-0 justify-center"
        aria-label={leg.result === "pending" && started ? "Live" : meta.label}
      >
        <ResultMark result={leg.result} live={started} />
      </span>
      {memberName ? <MemberChip name={memberName} /> : null}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "line-clamp-2 text-sm font-semibold",
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
      {legPrice(leg.american_odds) ? (
        <span className="shrink-0 font-display text-sm font-bold text-ink">
          {legPrice(leg.american_odds)}
        </span>
      ) : null}
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
      {hasLineProgress(leg) ? (
        <LegLineProgress leg={leg} className="w-full" />
      ) : null}
    </li>
  );
}
