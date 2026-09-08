"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import {
  PlayerCard,
  type PlayerCardData,
} from "@/components/players/player-card";
import {
  PlayerFilters,
  type PlayerFiltersValue,
} from "@/components/players/player-filters";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** The board carries every skill player, so render it in pages. */
const PAGE_SIZE = 50;

export type PlayerListProps = {
  players: PlayerCardData[];
  filters: PlayerFiltersValue;
  onFiltersChange: (next: PlayerFiltersValue) => void;
  onSelect?: (playerId: string) => void | Promise<void>;
  selectDisabled?: boolean;
  className?: string;
};

function sortPlayers(
  players: PlayerCardData[],
  sort: PlayerFiltersValue["sort"],
) {
  const copy = [...players];
  switch (sort) {
    case "our_prob":
      return copy.sort((a, b) => b.ourProbability - a.ourProbability);
    case "market_prob":
      return copy.sort(
        (a, b) => (b.marketProbability ?? -1) - (a.marketProbability ?? -1),
      );
    case "odds":
      // Lower American (more negative) = more favored; missing odds sink.
      return copy.sort(
        (a, b) => (a.americanOdds ?? 9999) - (b.americanOdds ?? 9999),
      );
    case "rank":
    default:
      return copy.sort((a, b) => a.rank - b.rank);
  }
}

export function PlayerList({
  players,
  filters,
  onFiltersChange,
  onSelect,
  selectDisabled,
  className,
}: PlayerListProps) {
  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const list = players.filter((p) => {
      if (filters.availableOnly && p.availability !== "available") return false;
      if (filters.position !== "ALL" && p.position !== filters.position) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q) ||
        p.opponent.toLowerCase().includes(q)
      );
    });
    return sortPlayers(list, filters.sort);
  }, [players, filters]);

  // Paging resets whenever the filters change, without an effect round-trip.
  const filterKey = `${filters.query}|${filters.position}|${filters.availableOnly}|${filters.sort}`;
  const [page, setPage] = useState({ key: filterKey, visible: PAGE_SIZE });
  const visible = page.key === filterKey ? page.visible : PAGE_SIZE;

  const shown = filtered.slice(0, visible);

  return (
    <div className={cn("space-y-3", className)}>
      <PlayerFilters value={filters} onChange={onFiltersChange} />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No players"
          description="Try clearing filters or searching a different name."
          actionLabel="Reset filters"
          onAction={() =>
            onFiltersChange({
              query: "",
              position: "ALL",
              availableOnly: false,
              sort: "rank",
            })
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {shown.map((player) => (
              <li key={player.id}>
                <PlayerCard
                  player={player}
                  onSelect={onSelect}
                  selectDisabled={selectDisabled}
                />
              </li>
            ))}
          </ul>

          {visible < filtered.length ? (
            <Button
              variant="secondary"
              fullWidth
              onClick={() =>
                setPage({ key: filterKey, visible: visible + PAGE_SIZE })
              }
            >
              Show more ({filtered.length - visible} left)
            </Button>
          ) : (
            <p className="pb-2 text-center text-xs text-ink-faint">
              {filtered.length} players
            </p>
          )}
        </>
      )}
    </div>
  );
}
