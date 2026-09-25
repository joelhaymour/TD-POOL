import { cn } from "@/lib/utils/cn";
import { MARK_PATH, MARK_VIEWBOX } from "./mark-path";

/** The ticket-with-a-check mark on its own. Takes the current text colour. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path fill="currentColor" fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

/**
 * POOL’D, with the ticket standing in for the apostrophe. Sized by font-size
 * like any heading; the mark scales with it.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-start font-display font-extrabold uppercase leading-[0.9] tracking-wide",
        className,
      )}
      role="img"
      aria-label="Pool’d"
    >
      <span aria-hidden>POOL</span>
      <LogoMark className="ml-[0.03em] mr-[0.01em] mt-[0.01em] h-[0.5em] w-auto shrink-0" />
      <span aria-hidden>D</span>
    </span>
  );
}
