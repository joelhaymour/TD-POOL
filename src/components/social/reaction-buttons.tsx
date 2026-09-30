"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ReactionSummary } from "@/lib/types";

/**
 * Thumbs up / thumbs down with counts. Tapping your current vote takes it
 * back. Updates at once and settles on what the server says.
 */
export function ReactionButtons({
  summary,
  onVote,
  disabled,
  size = "md",
  className,
}: {
  summary: ReactionSummary;
  onVote: (value: -1 | 0 | 1) => Promise<ReactionSummary | null>;
  /** Your own ticket or pick: counts only. */
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const [local, setLocal] = useState<ReactionSummary | null>(null);
  const [lastSeen, setLastSeen] = useState(summary);
  // A new summary from the parent (a refresh) replaces the optimistic one.
  if (summary !== lastSeen) {
    setLastSeen(summary);
    setLocal(null);
  }
  const shown = local ?? summary;

  async function vote(dir: -1 | 1) {
    const next: -1 | 0 | 1 = shown.mine === dir ? 0 : dir;
    const optimistic: ReactionSummary = {
      up: shown.up - (shown.mine === 1 ? 1 : 0) + (next === 1 ? 1 : 0),
      down: shown.down - (shown.mine === -1 ? 1 : 0) + (next === -1 ? 1 : 0),
      mine: next,
    };
    setLocal(optimistic);
    const settled = await onVote(next);
    setLocal(settled ?? shown);
  }

  const pad = size === "sm" ? "h-7 px-2 text-[11px]" : "h-9 px-2.5 text-xs";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {([1, -1] as const).map((dir) => {
        const on = shown.mine === dir;
        const count = dir === 1 ? shown.up : shown.down;
        const Icon = dir === 1 ? ThumbsUp : ThumbsDown;
        return (
          <button
            key={dir}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            aria-label={`${dir === 1 ? "Thumbs up" : "Thumbs down"}${count ? `, ${count}` : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              void vote(dir);
            }}
            className={cn(
              "pressable flex items-center gap-1 rounded-full font-bold tabular-nums disabled:cursor-default disabled:active:scale-100",
              pad,
              on ? "bg-ink text-white" : "bg-ink/[0.06] text-ink-muted",
              disabled && !on && "bg-transparent",
            )}
          >
            <Icon className={icon} aria-hidden />
            {count > 0 ? <span>{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
