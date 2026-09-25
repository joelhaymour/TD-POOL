import { cn } from "@/lib/utils/cn";
import { legShortTitle } from "@/lib/props/format";
import { gameStarted } from "@/lib/props/slip";
import type { NflGame, ParlayLeg } from "@/lib/types";

type ProgressLeg = Pick<
  ParlayLeg,
  "id" | "result" | "game_id" | "market_key" | "player_name" | "outcome_label" | "line"
>;

/**
 * One bar per leg: how much of a parlay is still alive, without opening it.
 * A parlay dies on a single miss, so a red segment is the whole story — it
 * reads before any of the numbers do. With `labels`, each bar names its
 * pick underneath, so a folded card still says what the bet is.
 */
export function LegProgress({
  legs,
  gamesById,
  tone = "light",
  labels = false,
  className,
}: {
  legs: ProgressLeg[];
  gamesById: Map<string, NflGame>;
  /** "dark" sits on the slip hero, "light" on a card. */
  tone?: "dark" | "light";
  labels?: boolean;
  className?: string;
}) {
  if (legs.length === 0) return null;

  const empty = tone === "dark" ? "bg-raised-fg/15" : "bg-ink/10";

  return (
    <div className={cn("flex gap-1.5", className)}>
      {legs.map((leg) => {
        const live = leg.result === "pending" && gameStarted(gamesById.get(leg.game_id));
        return (
          <div key={leg.id} className="min-w-0 flex-1">
            <span
              className={cn(
                "block h-1.5 rounded-full",
                leg.result === "won" && "bg-lime",
                leg.result === "lost" && "bg-danger",
                (leg.result === "push" || leg.result === "void") &&
                  (tone === "dark" ? "bg-raised-fg/35" : "bg-ink/30"),
                leg.result === "pending" && (live ? "bg-lime/35 animate-pulse" : empty),
              )}
              aria-hidden
            />
            {labels ? (
              <span
                className={cn(
                  "mt-1 block truncate text-[10px] font-semibold leading-tight",
                  leg.result === "won"
                    ? "text-lime"
                    : leg.result === "lost"
                      ? "text-danger line-through"
                      : tone === "dark"
                        ? "text-raised-fg/60"
                        : "text-ink-faint",
                )}
                title={legShortTitle(leg)}
              >
                {legShortTitle(leg)}
              </span>
            ) : null}
          </div>
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
