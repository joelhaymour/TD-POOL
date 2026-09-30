"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, RefreshCw, Search } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";
import { formatAmerican } from "@/lib/utils/odds";
import {
  isAlternateMarket,
  marketOrderIndex,
  PROP_GROUP_LABELS,
  PROP_GROUP_ORDER,
} from "@/lib/props/markets";
import { gameStarted } from "@/lib/props/slip";
import { teamFullToAbbr } from "@/lib/providers/the-odds-api/maps";
import type { GameProp, NflGame, ParlayLeg, PropMarketGroup } from "@/lib/types";

type Row = { key: string; label: string; alternate: boolean; options: GameProp[] };

type Section = {
  key: string;
  label: string;
  rows: Row[];
  /** A pick from this market is already on the slip. */
  picked: boolean;
};

const OVER_UNDER = new Set(["Over", "Under"]);

/**
 * FanDuel reuses one selection id per player across markets (receptions and
 * receiving yards share it), so a pick is identified by what it actually is.
 */
function selectionKey(
  p: Pick<GameProp, "market_key" | "player_name" | "outcome_label" | "line">,
): string {
  return `${p.market_key}|${p.player_name ?? ""}|${p.outcome_label}|${p.line ?? ""}`;
}

function optionLabel(p: GameProp): string {
  if (isAlternateMarket(p.market_key)) return `${p.line ?? ""}+`;
  if (OVER_UNDER.has(p.outcome_label)) {
    const side = p.outcome_label === "Over" ? "O" : "U";
    return p.player_name ? side : `${side} ${p.line ?? ""}`;
  }
  if (!p.player_name) {
    const team = teamFullToAbbr(p.outcome_label) ?? p.outcome_label;
    return p.line != null ? `${team} ${p.line > 0 ? "+" : ""}${p.line}` : team;
  }
  return p.outcome_label === "Yes" ? "" : p.outcome_label;
}

/**
 * One row per player and line, with Over/Under side by side like a
 * sportsbook. Alternate ladders put every line for a player on one row.
 */
function marketRows(options: GameProp[]): Row[] {
  const alternate = isAlternateMarket(options[0]?.market_key ?? "");
  const rows = new Map<string, Row>();
  for (const p of options) {
    const key = !p.player_name
      ? "game"
      : alternate
        ? p.player_name
        : `${p.player_name}|${p.line ?? ""}`;
    const label = !p.player_name
      ? ""
      : alternate || !OVER_UNDER.has(p.outcome_label) || p.line == null
        ? p.player_name
        : `${p.player_name} ${p.line}`;
    const row = rows.get(key) ?? { key, label, alternate, options: [] };
    row.options.push(p);
    rows.set(key, row);
  }

  const list = [...rows.values()];
  for (const row of list) {
    row.options.sort((a, b) =>
      alternate
        ? (a.line ?? 0) - (b.line ?? 0)
        : a.outcome_label === "Over"
          ? -1
          : b.outcome_label === "Over"
            ? 1
            : 0,
    );
  }
  const first = options[0];
  if (first?.player_name) {
    if (!alternate && first.market_group !== "td_scorers" && OVER_UNDER.has(first.outcome_label)) {
      list.sort((a, b) => (b.options[0]?.line ?? 0) - (a.options[0]?.line ?? 0));
    } else {
      list.sort(
        (a, b) => (a.options[0]?.american_odds ?? 0) - (b.options[0]?.american_odds ?? 0),
      );
    }
  }
  return list;
}

function matchesQuery(p: GameProp, query: string): boolean {
  const haystack = `${p.player_name ?? ""} ${p.outcome_label} ${p.market_label}`;
  return haystack.toLowerCase().includes(query);
}

export function PropPickerSheet({
  game,
  props,
  loading,
  note,
  picksLeft,
  slipLegs,
  locked,
  busy,
  extendedLoaded,
  onClose,
  onAdd,
  onRefresh,
  onLoadExtended,
}: {
  /** null keeps the sheet closed. */
  game: NflGame | null;
  props: GameProp[];
  loading: boolean;
  note: string | null;
  /** Null on an open slip — no limit. */
  picksLeft: number | null;
  slipLegs: ParlayLeg[];
  locked: boolean;
  busy: boolean;
  extendedLoaded: boolean;
  onClose: () => void;
  onAdd: (prop: GameProp) => void;
  /** Admins only — spends odds credits. */
  onRefresh?: () => void;
  onLoadExtended: () => void;
}) {
  const [group, setGroup] = useState<PropMarketGroup>("td_scorers");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();

  const onSlip = useMemo(
    () => new Set(slipLegs.map((l) => selectionKey(l))),
    [slipLegs],
  );

  const groups = useMemo(() => {
    const found = new Set<PropMarketGroup>();
    for (const p of props) found.add(p.market_group);
    return PROP_GROUP_ORDER.filter((g) => found.has(g));
  }, [props]);
  const active = groups.includes(group) ? group : groups[0];

  // A search runs across every market, since hunting for one player is the
  // reason to search at all.
  const sections = useMemo<Section[]>(() => {
    const byMarket = new Map<string, GameProp[]>();
    for (const p of props) {
      if (search ? !matchesQuery(p, search) : p.market_group !== active) continue;
      const list = byMarket.get(p.market_key) ?? [];
      list.push(p);
      byMarket.set(p.market_key, list);
    }
    return [...byMarket.entries()]
      .map(([key, options]) => ({
        key,
        label: options[0]!.market_label,
        rows: marketRows(options),
        picked: options.some((p) => onSlip.has(selectionKey(p))),
      }))
      .sort((a, b) => marketOrderIndex(a.key) - marketOrderIndex(b.key));
  }, [props, active, search, onSlip]);

  const started = gameStarted(game ?? undefined);
  const closedReason = started
    ? "Kicked off — picks are closed"
    : locked
      ? "This slip is locked"
      : picksLeft == null
        ? "Add as many as you like"
        : picksLeft <= 0
          ? "Your pick is in"
          : "Make your one pick";
  const addDisabled =
    busy || started || locked || (picksLeft != null && picksLeft <= 0);

  function toggle(key: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  return (
    <Sheet
      open={game != null}
      onClose={onClose}
      title={game ? `${game.away_team} @ ${game.home_team}` : ""}
      description={closedReason}
    >
      {loading && props.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">
          Loading the FanDuel board…
        </p>
      ) : props.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-ink-muted">
            {note ?? "No odds posted for this game yet."}
          </p>
          {onRefresh ? (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-turf"
              onClick={onRefresh}
            >
              <RefreshCw className="h-3 w-3" /> Try again
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="sticky -top-4 z-10 -mx-4 -mt-4 space-y-2 bg-chalk px-4 pb-2 pt-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a player or market"
                className="h-10 w-full rounded-full border border-transparent bg-ink/[0.05] pl-9 focus:bg-white pr-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
              />
            </div>

            {search ? (
              <p className="text-[11px] font-medium text-ink-faint">
                {sections.length === 0
                  ? "No markets match"
                  : `Matches in ${sections.length} market${sections.length === 1 ? "" : "s"}`}
              </p>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
                      active === g
                        ? "bg-raised text-lime"
                        : "border border-border text-ink-muted hover:text-ink",
                    )}
                    onClick={() => setGroup(g)}
                  >
                    {PROP_GROUP_LABELS[g]}
                  </button>
                ))}
              </div>
            )}

            {note || onRefresh ? (
              <div className="flex items-center justify-between gap-2 text-[11px] text-ink-faint">
                <span className="min-w-0 truncate">{note ?? "FanDuel prices"}</span>
                {onRefresh ? (
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1 font-bold uppercase tracking-wider hover:text-ink"
                    onClick={onRefresh}
                  >
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <ul className="space-y-1.5">
            {sections.map((section) => {
              const open = Boolean(search) || expanded.has(section.key);
              return (
                <li
                  key={section.key}
                  className="overflow-hidden rounded-2xl bg-ink/[0.04]"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-3 text-left"
                    aria-expanded={open}
                    onClick={() => toggle(section.key)}
                  >
                    <span className="min-w-0 flex-1 truncate font-display text-sm font-bold uppercase tracking-wide text-ink">
                      {section.label}
                    </span>
                    {section.picked ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-turf" aria-label="On the slip" />
                    ) : null}
                    <span className="shrink-0 text-[11px] font-semibold text-ink-faint">
                      {section.rows.length}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-ink-faint transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>

                  {open ? (
                    <ul className="border-t border-border bg-chalk px-3">
                      {section.rows.map((row) => (
                        <li
                          key={row.key}
                          className={cn(
                            "gap-2 border-b border-border py-2 last:border-b-0",
                            row.alternate ? "block" : "flex items-center justify-between",
                          )}
                        >
                          {row.label ? (
                            <span
                              className={cn(
                                "min-w-0 truncate text-sm font-semibold text-ink",
                                row.alternate && "mb-1.5 block",
                              )}
                            >
                              {row.label}
                            </span>
                          ) : null}
                          <div
                            className={cn(
                              "flex gap-1.5",
                              row.alternate
                                ? "flex-wrap"
                                : row.label
                                  ? "shrink-0"
                                  : "grid w-full grid-cols-2",
                            )}
                          >
                            {row.options.map((p) => {
                              const added = onSlip.has(selectionKey(p));
                              const label = optionLabel(p);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  disabled={addDisabled || added}
                                  onClick={() => onAdd(p)}
                                  className={cn(
                                    "flex min-w-[4.75rem] items-center justify-center gap-1 rounded-lg border px-2.5 py-2 text-sm font-bold transition",
                                    added
                                      ? "border-lime bg-lime text-raised"
                                      : "border-border-strong bg-chalk text-ink hover:border-turf disabled:opacity-45",
                                  )}
                                >
                                  {added ? <Check className="h-3.5 w-3.5" /> : null}
                                  {label ? (
                                    <span className={added ? "text-raised/80" : "text-ink-muted"}>
                                      {label}
                                    </span>
                                  ) : null}
                                  <span className="font-display">
                                    {formatAmerican(p.american_odds)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {!extendedLoaded && !started ? (
            <button
              type="button"
              disabled={loading}
              onClick={onLoadExtended}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-xs font-bold uppercase tracking-wider text-ink-muted transition hover:border-turf hover:text-ink disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {loading ? "Loading…" : "Alt lines, defense & more markets"}
            </button>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
