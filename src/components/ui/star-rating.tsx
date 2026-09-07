import { cn } from "@/lib/utils/cn";

export type StarRatingProps = {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  showValue?: boolean;
};

const sizeClasses = {
  sm: "text-xs gap-0.5",
  md: "text-sm gap-0.5",
  lg: "text-base gap-1",
};

export function StarRating({
  value,
  max = 5,
  size = "md",
  label,
  className,
  showValue = false,
}: StarRatingProps) {
  const clamped = Math.max(0, Math.min(max, Math.round(value)));

  return (
    <div
      className={cn("inline-flex items-center", sizeClasses[size], className)}
      role="img"
      aria-label={label ?? `${clamped} out of ${max} stars`}
    >
      {label ? (
        <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
          {label}
        </span>
      ) : null}
      <span className="inline-flex items-center leading-none text-turf">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={cn(i < clamped ? "text-turf" : "text-ink/15")}
            aria-hidden
          >
            ★
          </span>
        ))}
      </span>
      {showValue ? (
        <span className="ml-1 font-display text-sm font-bold text-ink">
          {clamped}
        </span>
      ) : null}
    </div>
  );
}
