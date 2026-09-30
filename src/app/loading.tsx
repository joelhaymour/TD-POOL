import { CardsSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Shown the instant a screen is tapped (a league from home, notifications)
 * while it loads, so the tap always answers.
 */
export default function Loading() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg animate-fade-in">
      <div className="px-4 pb-3 pt-[max(0.75rem,var(--top-inset,env(safe-area-inset-top)))]">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>
      <div className="px-4 py-4">
        <CardsSkeleton />
      </div>
    </div>
  );
}
