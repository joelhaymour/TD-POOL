"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type PlayerPositionFilter = "ALL" | "RB" | "WR" | "TE" | "QB";

export type PlayerSortOption =
  | "rank"
  | "our_prob"
  | "market_prob"
  | "odds";

export type PlayerFiltersValue = {
  query: string;
  position: PlayerPositionFilter;
  availableOnly: boolean;
  sort: PlayerSortOption;
};

export type PlayerFiltersProps = {
  value: PlayerFiltersValue;
  onChange: (next: PlayerFiltersValue) => void;
  className?: string;
};

const positions: PlayerPositionFilter[] = ["ALL", "RB", "WR", "TE", "QB"];

const inputClass =
  "h-10 w-full rounded-xl border border-border-strong bg-chalk px-3 text-sm text-ink outline-none transition focus:border-turf focus:ring-2 focus:ring-turf/20";

export function PlayerFilters({
  value,
  onChange,
  className,
}: PlayerFiltersProps) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          placeholder="Search players"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          className={cn(inputClass, "pl-9")}
          aria-label="Search players"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {positions.map((pos) => {
          const active = value.position === pos;
          return (
            <button
              key={pos}
              type="button"
              onClick={() => onChange({ ...value, position: pos })}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition",
                active
                  ? "bg-ink text-lime"
                  : "bg-chalk text-ink-muted border border-border hover:border-border-strong",
              )}
            >
              {pos === "ALL" ? "All" : pos}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-chalk px-3 py-2 text-xs font-semibold text-ink">
          <input
            type="checkbox"
            className="accent-turf"
            checked={value.availableOnly}
            onChange={(e) =>
              onChange({ ...value, availableOnly: e.target.checked })
            }
          />
          Available only
        </label>
        <select
          aria-label="Sort players"
          className={cn(inputClass, "flex-1 appearance-none font-semibold")}
          value={value.sort}
          onChange={(e) =>
            onChange({
              ...value,
              sort: e.target.value as PlayerSortOption,
            })
          }
        >
          <option value="rank">TD Pool Rank</option>
          <option value="our_prob">Our probability</option>
          <option value="market_prob">Market probability</option>
          <option value="odds">Anytime TD odds</option>
        </select>
      </div>
    </div>
  );
}
