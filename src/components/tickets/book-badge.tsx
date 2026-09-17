import { sportsbook } from "@/lib/props/sportsbooks";
import { cn } from "@/lib/utils/cn";

/** The book's wordmark on its own colour, small enough for a card header. */
export function BookBadge({
  book,
  className,
}: {
  book: string | null;
  className?: string;
}) {
  if (!book) return null;
  const def = sportsbook(book);
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-1.5 font-display text-[10px] font-extrabold tracking-wide ring-1 ring-inset ring-white/15",
        className,
      )}
      style={{
        backgroundColor: def?.brand.bg ?? "#333333",
        color: def?.brand.fg ?? "#FFFFFF",
      }}
    >
      {def?.name ?? book}
    </span>
  );
}
