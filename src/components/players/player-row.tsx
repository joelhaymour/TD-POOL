import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { formatAmerican } from "@/lib/utils/odds";
import { Button } from "@/components/ui/button";
import { SelectPickButton } from "@/components/picks/select-pick-button";
import type { PlayerCardData } from "@/components/players/player-card";

export type PlayerRowProps = {
  player: PlayerCardData;
  onSelect?: (playerId: string) => void | Promise<void>;
  selectDisabled?: boolean;
};

/** Stat column widths, shared with the list header so the two stay aligned. */
const TD_COL = "w-12 shrink-0 text-right";
const ODDS_COL = "w-14 shrink-0 text-right";

function pct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

/** Column labels for a PlayerRow list. */
export function PlayerRowHeader() {
  return (
    <div className="flex items-center gap-2 bg-field px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
      <span className="w-6 shrink-0 text-center">#</span>
      <span className="min-w-0 flex-1">Player</span>
      <span className={TD_COL}>TD %</span>
      <span className={ODDS_COL}>Odds</span>
    </div>
  );
}

/**
 * Denser sibling of PlayerCard for game-scoped lists, where the team and
 * opponent are already established by the surrounding context. Stats sit on
 * the first line so they align into columns; actions get the second, which a
 * phone has no room for otherwise.
 */
export function PlayerRow({
  player,
  onSelect,
  selectDisabled,
}: PlayerRowProps) {
  const taken = player.availability === "taken";
  const locked = player.availability === "locked";
  const out = player.availability === "injured";
  const canSelect =
    player.availability === "available" && !selectDisabled && Boolean(onSelect);

  return (
    <article className={cn("px-3 py-2.5", (taken || out) && "opacity-65")}>
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-center font-display text-sm font-extrabold leading-none text-ink-faint">
          {player.rank}
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="truncate font-display text-sm font-bold uppercase leading-tight tracking-wide text-ink">
            {player.name}
          </h4>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
            <span>{player.position}</span>
            {player.availability === "questionable" ? (
              <span className="font-bold uppercase text-warning">Q</span>
            ) : null}
            {out ? (
              <span className="font-bold uppercase text-danger">Out</span>
            ) : null}
            {taken ? (
              <span className="truncate">
                · {player.takenByName ?? "Taken"}
              </span>
            ) : null}
          </p>
        </div>

        <span
          className={cn(
            TD_COL,
            "font-display text-base font-extrabold leading-none text-ink",
          )}
        >
          {pct(player.ourProbability)}
        </span>
        <span
          className={cn(
            ODDS_COL,
            "font-display text-sm font-bold leading-none text-turf",
          )}
        >
          {player.americanOdds != null
            ? formatAmerican(player.americanOdds)
            : "—"}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 pl-8">
        <Link
          href={player.analysisHref}
          className={cn(
            "inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-border-strong bg-chalk text-[11px] font-semibold tracking-wide text-ink transition",
            "hover:bg-field-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turf",
          )}
        >
          View Analysis
        </Link>

        {taken ? (
          <Button
            variant="ghost"
            size="sm"
            disabled
            className="h-8 flex-1 !opacity-100 text-[11px]"
          >
            Taken
          </Button>
        ) : locked ? (
          <Button variant="ghost" size="sm" disabled className="h-8 flex-1 text-[11px]">
            Locked
          </Button>
        ) : canSelect ? (
          <SelectPickButton
            playerName={player.name}
            onConfirm={() => onSelect?.(player.id)}
            size="sm"
            className="h-8 flex-1 text-[11px]"
            label="Select Player"
          />
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled
            className="h-8 flex-1 text-[11px]"
          >
            Select Player
          </Button>
        )}
      </div>
    </article>
  );
}
