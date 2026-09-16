import { cn } from "@/lib/utils/cn";
import { gameStarted } from "@/lib/props/slip";
import type { NflGame, ParlayLeg } from "@/lib/types";

/**
 * One bar per leg: how much of a parlay is still alive, without opening it.
 * A parlay dies on a single miss, so a red segment is the whole story — it
 * reads before any of the numbers do.
 */
export function LegProgress({
  legs,
  gamesById,
  tone = "light",
  className,
}: {
  legs: Pick<ParlayLeg, "id" | "result" | "game_id">[];
  gamesById: Map<string, NflGame>;
  /** "dark" sits on the slip hero, "light" on a card. */
  tone?: "dark" | "light";
  className?: string;
}) {
  if (legs.length === 0) return null;

  const empty = tone === "dark" ? "bg-raised-fg/15" : "bg-ink/10";

  return (
    <div className={cn("flex gap-1", className)} aria-hidden>
      {legs.map((leg) => {
        const live = leg.result === "pending" && gameStarted(gamesById.get(leg.game_id));
        return (
          <span
            key={leg.id}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              leg.result === "won" && "bg-lime",
              leg.result === "lost" && "bg-danger",
              (leg.result === "push" || leg.result === "void") &&
                (tone === "dark" ? "bg-raised-fg/35" : "bg-ink/30"),
              leg.result === "pending" && (live ? "bg-turf animate-pulse" : empty),
            )}
          />
        );
      })}
    </div>
  );
}

/** "2 of 4 hit", "1 miss · 3 live" — the same story in words. */
export function legProgressLabel(
  legs: Pick<ParlayLeg, "result">[],
): string | null {
  if (legs.length === 0) return null;
  const won = legs.filter((l) => l.result === "won").length;
  const lost = legs.filter((l) => l.result === "lost").length;
  const graded = legs.filter((l) => l.result !== "pending").length;
  if (graded === 0) return null;
  if (lost > 0) {
    return `${lost} miss${lost === 1 ? "" : "es"} · ${won} hit`;
  }
  return `${won} of ${legs.length} hit`;
}
