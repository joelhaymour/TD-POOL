import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { formatAmerican } from "@/lib/utils/odds";
import { Badge, type BadgeStatus } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { SelectPickButton } from "@/components/picks/select-pick-button";

export type PlayerCardAvailability =
  | "available"
  | "taken"
  | "locked"
  | "injured"
  | "questionable";

export type PlayerCardData = {
  id: string;
  rank: number;
  name: string;
  team: string;
  position: string;
  opponent: string;
  ourProbability: number;
  marketProbability: number | null;
  americanOdds: number | null;
  matchupStars: number;
  goalLineStars: number;
  availability: PlayerCardAvailability;
  takenByName?: string | null;
  analysisHref: string;
  limitedData?: boolean;
};

export type PlayerCardProps = {
  player: PlayerCardData;
  onSelect?: (playerId: string) => void | Promise<void>;
  selectDisabled?: boolean;
  className?: string;
};

function pct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "Unavailable";
  return `${Math.round(n * 100)}%`;
}

export function PlayerCard({
  player,
  onSelect,
  selectDisabled,
  className,
}: PlayerCardProps) {
  const taken = player.availability === "taken";
  const locked = player.availability === "locked";
  const canSelect =
    player.availability === "available" && !selectDisabled && Boolean(onSelect);

  const status: BadgeStatus =
    player.availability === "questionable"
      ? "questionable"
      : player.availability === "injured"
        ? "injured"
        : player.availability === "locked"
          ? "locked"
          : taken
            ? "taken"
            : "available";

  return (
    <article
      className={cn(
        "rounded-2xl border border-border bg-chalk p-3 shadow-card",
        taken && "opacity-90",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-raised text-lime">
          <span className="text-[9px] font-bold uppercase leading-none tracking-wider text-lime/70">
            Rank
          </span>
          <span className="font-display text-xl font-extrabold leading-none">
            {player.rank}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-display text-lg font-bold uppercase leading-tight tracking-wide text-ink">
                {player.name}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-ink-muted">
                {player.team} {player.position}
                <span className="mx-1.5 text-ink/25">·</span>
                vs {player.opponent}
              </p>
            </div>
            <Badge status={status} />
          </div>
        </div>
      </div>

      {/* The odds tile is only worth its space when a price exists. With no
          props feed it read "Unavailable" on every card in the league. */}
      <div
        className={cn(
          "mt-3 grid gap-2",
          player.americanOdds != null ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        <div className="rounded-xl bg-field px-2.5 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-ink-faint">
            TD Chance
          </p>
          <p className="font-display text-xl font-extrabold text-ink">
            {pct(player.ourProbability)}
          </p>
        </div>
        {player.americanOdds != null ? (
          <div className="rounded-xl bg-raised px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-raised-fg/55">
              Odds
            </p>
            <p className="font-display text-xl font-extrabold text-lime">
              {formatAmerican(player.americanOdds)}
            </p>
          </div>
        ) : null}
      </div>

      {player.limitedData ? (
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-warning">
          Limited data
        </p>
      ) : null}

      {/* Goal-line rating drives TD Chance already, so a second star row here
          was redundant. The underlying usage is on the analysis page. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarRating value={player.matchupStars} size="sm" label="Matchup" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={player.analysisHref}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-lg border border-border-strong bg-chalk px-3 text-xs font-semibold tracking-wide text-ink transition",
            "hover:bg-field-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turf",
          )}
        >
          View Analysis
        </Link>

        {taken ? (
          <Button variant="ghost" size="sm" disabled className="w-full !opacity-100">
            Taken by {player.takenByName ?? "—"}
          </Button>
        ) : locked ? (
          <Button variant="ghost" size="sm" disabled className="w-full">
            Locked
          </Button>
        ) : canSelect ? (
          <SelectPickButton
            playerName={player.name}
            onConfirm={() => onSelect?.(player.id)}
            className="w-full"
          />
        ) : (
          <Button variant="primary" size="sm" disabled className="w-full">
            Select Player
          </Button>
        )}
      </div>
    </article>
  );
}
