import { cn } from "@/lib/utils/cn";

export type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-ink/10",
        className,
      )}
      aria-hidden
    />
  );
}

export function PlayerCardSkeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-chalk p-3 shadow-card",
        className,
      )}
    >
      <div className="flex gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-8 w-14" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <PlayerCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Stand-in cards while a screen loads: shows where things will be at once. */
export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading">
      <Skeleton className="h-5 w-32" />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-[1.4rem] bg-white/75 p-4 shadow-[var(--glass-shadow)]">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-16 rounded-xl" />
        </div>
      ))}
    </div>
  );
}
