import { cn } from "@/lib/utils/cn";
import { APOSTROPHE_PATH, APOSTROPHE_VIEWBOX, MARK_PATH, MARK_VIEWBOX } from "./mark-path";

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
 * POOL’D, with the ticket standing in for the apostrophe: stood up and
 * leaning like a ’, tucked against the L. Sized by font-size like any
 * heading; the mark scales with it.
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
      <svg
        viewBox={APOSTROPHE_VIEWBOX}
        aria-hidden
        className="-ml-[0.02em] mr-[0.035em] mt-[0.2em] h-[0.4em] w-auto shrink-0"
      >
        <path fill="currentColor" fillRule="evenodd" d={APOSTROPHE_PATH} />
      </svg>
      <span aria-hidden>D</span>
    </span>
  );
}
