import { Check, Minus, Slash, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { LegResult, PickResult } from "@/lib/types";

/**
 * How a graded thing reads: a drawn mark, never an emoji. Emoji render
 * differently on every device and drag the whole app toward a chat message.
 */
export function ResultMark({
  result,
  live = false,
  className,
}: {
  result: LegResult | PickResult | "td" | "no_td";
  /** Pending, but its game is under way. */
  live?: boolean;
  className?: string;
}) {
  const size = cn("h-4 w-4", className);

  if (result === "won" || result === "td") {
    return <Check className={cn(size, "text-lime")} aria-hidden strokeWidth={3} />;
  }
  if (result === "lost" || result === "no_td") {
    return <X className={cn(size, "text-danger")} aria-hidden strokeWidth={3} />;
  }
  if (result === "push") {
    return <Minus className={cn(size, "text-ink-faint")} aria-hidden strokeWidth={3} />;
  }
  if (result === "void") {
    return <Slash className={cn(size, "text-ink-faint")} aria-hidden strokeWidth={2.5} />;
  }
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        live ? "animate-pulse bg-turf" : "bg-ink/30",
      )}
      aria-hidden
    />
  );
}

/** Initials in a ring — who added a pick, at a glance. */
export function MemberChip({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-field-deep text-[9px] font-bold text-ink-muted",
        className,
      )}
      title={name}
    >
      {initials || "?"}
    </span>
  );
}
