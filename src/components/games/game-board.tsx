"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PlayerRow, PlayerRowHeader } from "@/components/players/player-row";
import type { PlayerCardData } from "@/components/players/player-card";
import { teamNickname } from "@/lib/nfl/teams";
import type { NflGame } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

export type GameGroup = {
  game: NflGame;
  players: PlayerCardData[];
};

export type GameBoardProps = {
  games: GameGroup[];
  /** Game to open on mount, so returning from a player analysis lands back here. */
  initialGameId?: string | null;
  onSelect?: (playerId: string) => void | Promise<void>;
  selectDisabled?: boolean;
};

/**
 * Keep ?game= in sync without a Next navigation. The dashboard page rebuilds
 * the whole board on request, which is far too much work for a tile tap; this
 * only has to survive a link out to a player and back.
 */
function syncGameParam(gameId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (gameId) url.searchParams.set("game", gameId);
  else url.searchParams.delete("game");
  window.history.replaceState(null, "", url);
}

// NFL weeks are described in Eastern time — a Sunday night kickoff is a Sunday
// game even where it lands after midnight locally.
const ET = "America/New_York";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  weekday: "long",
  month: "short",
  day: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  hour: "numeric",
  minute: "2-digit",
});

function dayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return dayFormat.format(d);
}

function kickoffLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return `${timeFormat.format(d)} ET`;
}

function statusLabel(game: NflGame) {
  if (game.status === "final") {
    const scored = game.home_score != null && game.away_score != null;
    return scored
      ? `Final ${game.away_score}–${game.home_score}`
      : "Final";
  }
  if (game.status === "in_progress") return "Live";
  return null;
}

export function GameBoard({
  games,
  initialGameId,
  onSelect,
  selectDisabled,
}: GameBoardProps) {
  const [openGameId, setOpenGameId] = useState<string | null>(
    initialGameId ?? null,
  );
  const [side, setSide] = useState<"away" | "home">("away");

  function openGame(gameId: string) {
    setOpenGameId(gameId);
    setSide("away");
    syncGameParam(gameId);
  }

  function closeGame() {
    setOpenGameId(null);
    syncGameParam(null);
  }

  const ordered = useMemo(
    () =>
      [...games].sort(
        (a, b) =>
          new Date(a.game.kickoff_at).getTime() -
          new Date(b.game.kickoff_at).getTime(),
      ),
    [games],
  );

  const days = useMemo(() => {
    const byDay = new Map<string, GameGroup[]>();
    for (const group of ordered) {
      const key = dayKey(group.game.kickoff_at);
      const list = byDay.get(key);
      if (list) list.push(group);
      else byDay.set(key, [group]);
    }
    return [...byDay.entries()];
  }, [ordered]);

  const open = ordered.find((g) => g.game.id === openGameId) ?? null;

  if (games.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-6 w-6" />}
        title="No games yet"
        description="The schedule for this week hasn't loaded. Check back shortly."
      />
    );
  }

  if (open) {
    const { game, players } = open;
    const teams = {
      away: game.away_team,
      home: game.home_team,
    };
    const activeTeam = teams[side];
    const roster = players
      .filter((p) => p.team === activeTeam)
      .sort((a, b) => a.rank - b.rank)
      // Tag the analysis link so its back button returns to this game.
      .map((p) => ({
        ...p,
        analysisHref: `${p.analysisHref}?game=${encodeURIComponent(game.id)}`,
      }));
    const status = statusLabel(game);

    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={closeGame}
          className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-turf hover:underline"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All games
        </button>

        <div className="rounded-2xl border border-border bg-ink px-4 py-3 text-chalk">
          <h3 className="font-display text-lg font-extrabold uppercase leading-tight tracking-wide">
            {teamNickname(game.away_team)}
            <span className="mx-1.5 text-chalk/40">@</span>
            {teamNickname(game.home_team)}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-chalk/60">
            {kickoffLabel(game.kickoff_at)}
            {status ? ` · ${status}` : ""}
            {game.stadium ? ` · ${game.stadium}` : ""}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Team"
          className="grid grid-cols-2 gap-1.5"
        >
          {(["away", "home"] as const).map((key) => {
            const abbr = teams[key];
            const active = side === key;
            const count = players.filter((p) => p.team === abbr).length;
            return (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setSide(key)}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-bold uppercase tracking-wide transition",
                  active
                    ? "bg-ink text-lime"
                    : "border border-border bg-chalk text-ink-muted hover:border-border-strong",
                )}
              >
                {teamNickname(abbr)}
                <span
                  className={cn(
                    "ml-1.5 text-[11px] font-semibold",
                    active ? "text-lime/60" : "text-ink-faint",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {roster.length === 0 ? (
          <p className="rounded-2xl border border-border bg-chalk px-4 py-8 text-center text-sm text-ink-muted">
            No ranked players for {teamNickname(activeTeam)} this week.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-chalk shadow-card">
            <PlayerRowHeader />
            <ul className="divide-y divide-border">
              {roster.map((player) => (
                <li key={player.id}>
                  <PlayerRow
                    player={player}
                    onSelect={onSelect}
                    selectDisabled={selectDisabled}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map(([day, dayGames]) => (
        <section key={day}>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">
            {day}
          </h3>
          <ul className="space-y-2">
            {dayGames.map(({ game, players }) => {
              const available = players.filter(
                (p) => p.availability === "available",
              ).length;
              const best = [...players].sort((a, b) => a.rank - b.rank)[0];
              const status = statusLabel(game);

              return (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => openGame(game.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border border-border bg-chalk px-4 py-3 text-left shadow-card transition",
                      "hover:border-border-strong hover:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turf",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-bold uppercase leading-tight tracking-wide text-ink">
                        {teamNickname(game.away_team)}
                        <span className="mx-1.5 text-ink/30">@</span>
                        {teamNickname(game.home_team)}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-ink-muted">
                        {kickoffLabel(game.kickoff_at)}
                        {status ? (
                          <span className="ml-1.5 font-bold text-turf">
                            {status}
                          </span>
                        ) : null}
                      </p>
                      {best ? (
                        <p className="mt-1 truncate text-[11px] text-ink-faint">
                          Top: {best.name} ·{" "}
                          {Math.round(best.ourProbability * 100)}%
                        </p>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-extrabold leading-none text-ink">
                        {available}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                        open
                      </p>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
