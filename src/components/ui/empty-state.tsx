import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk/70 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-field-deep text-turf">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
        {title}
      </h3>
      {description ? (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
