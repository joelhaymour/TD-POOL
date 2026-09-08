"use client";

import { useMemo } from "react";
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
import { cn } from "@/lib/utils/cn";

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
    let list = players.filter((p) => {
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
        <ul className="space-y-3">
          {filtered.map((player) => (
            <li key={player.id}>
              <PlayerCard
                player={player}
                onSelect={onSelect}
                selectDisabled={selectDisabled}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
