"use client";

import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
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
  "h-10 w-full rounded-xl border border-transparent bg-ink/[0.05] px-3 text-sm text-ink outline-none focus:bg-white transition focus:border-turf focus:ring-2 focus:ring-turf/20";

const SORT_LABEL: Record<PlayerSortOption, string> = {
  rank: "TD Pool rank",
  our_prob: "Our probability",
  market_prob: "Market probability",
  odds: "Anytime TD odds",
};

/**
 * Search is always there; position, "available only" and sort sit behind one
 * Filters button so the board leads with players, not controls. The button
 * shows how many filters are on.
 */
export function PlayerFilters({
  value,
  onChange,
  className,
}: PlayerFiltersProps) {
  const [open, setOpen] = useState(false);
  const active =
    (value.position !== "ALL" ? 1 : 0) + (value.availableOnly ? 1 : 0) + (value.sort !== "rank" ? 1 : 0);

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            placeholder="Search players"
            value={value.query}
            onChange={(e) => onChange({ ...value, query: e.target.value })}
            className={cn(inputClass, "rounded-full pl-9")}
            aria-label="Search players"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "pressable flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold",
            open || active ? "bg-ink text-white" : "bg-ink/[0.06] text-ink",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filters{active ? ` · ${active}` : ""}
        </button>
      </div>

      {open ? (
        <div className="animate-fade-in space-y-3 rounded-[1.4rem] bg-chalk p-3 shadow-card">
          <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {positions.map((pos) => {
              const on = value.position === pos;
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => onChange({ ...value, position: pos })}
                  aria-pressed={on}
                  className={cn(
                    "pressable shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold",
                    on ? "bg-ink text-white" : "bg-ink/[0.06] text-ink-muted",
                  )}
                >
                  {pos === "ALL" ? "All" : pos}
                </button>
              );
            })}
          </div>
          <label className="flex items-center justify-between gap-3 text-sm font-medium text-ink">
            Only players still available
            <input
              type="checkbox"
              className="h-5 w-5 accent-turf"
              checked={value.availableOnly}
              onChange={(e) => onChange({ ...value, availableOnly: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm font-medium text-ink">
            Sort by
            <select
              aria-label="Sort players"
              className={cn(inputClass, "h-9 w-auto appearance-none rounded-full px-3.5 font-semibold")}
              value={value.sort}
              onChange={(e) => onChange({ ...value, sort: e.target.value as PlayerSortOption })}
            >
              {(Object.keys(SORT_LABEL) as PlayerSortOption[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
