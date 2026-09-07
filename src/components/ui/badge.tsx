import { cn } from "@/lib/utils/cn";

export type BadgeStatus =
  | "available"
  | "taken"
  | "locked"
  | "injured"
  | "questionable"
  | "pending"
  | "td"
  | "no_td"
  | "healthy"
  | "default";

export type BadgeProps = {
  status?: BadgeStatus;
  children?: React.ReactNode;
  className?: string;
};

const statusStyles: Record<BadgeStatus, string> = {
  available: "bg-turf/12 text-turf-deep border-turf/25",
  taken: "bg-ink/8 text-ink-muted border-border-strong",
  locked: "bg-ink/10 text-ink border-border-strong",
  injured: "bg-danger/10 text-danger border-danger/25",
  questionable: "bg-warning/12 text-warning border-warning/30",
  pending: "bg-field-deep text-ink-muted border-border",
  td: "bg-lime/40 text-ink border-lime/60",
  no_td: "bg-ink/6 text-ink-faint border-border",
  healthy: "bg-turf/10 text-turf border-turf/20",
  default: "bg-chalk text-ink-muted border-border",
};

const statusLabels: Partial<Record<BadgeStatus, string>> = {
  available: "Available",
  taken: "Taken",
  locked: "Locked",
  injured: "Injured",
  questionable: "Questionable",
  pending: "Pending",
  td: "TD",
  no_td: "No TD",
  healthy: "Healthy",
};

export function Badge({ status = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
        statusStyles[status],
        className,
      )}
    >
      {children ?? statusLabels[status] ?? status}
    </span>
  );
}
