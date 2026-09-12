"use client";

import { useMemo, useState } from "react";
import { Check, Plus, RefreshCw } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";
import { formatAmerican } from "@/lib/utils/odds";
import {
  isAlternateMarket,
  PROP_GROUP_LABELS,
  PROP_GROUP_ORDER,
} from "@/lib/props/markets";
import { gameStarted } from "@/lib/props/slip";
import { teamFullToAbbr } from "@/lib/providers/the-odds-api/maps";
import type { GameProp, NflGame, ParlayLeg, PropMarketGroup } from "@/lib/types";

type Row = { key: string; label: string; alternate: boolean; options: GameProp[] };

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
  picksLeft: number;
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

  const grouped = useMemo(() => {
    const byGroup = new Map<PropMarketGroup, Map<string, GameProp[]>>();
    for (const p of props) {
      const markets = byGroup.get(p.market_group) ?? new Map<string, GameProp[]>();
      const list = markets.get(p.market_label) ?? [];
      list.push(p);
      markets.set(p.market_label, list);
      byGroup.set(p.market_group, markets);
    }
    return byGroup;
  }, [props]);

  const onSlip = useMemo(
    () => new Set(slipLegs.map((l) => selectionKey(l))),
    [slipLegs],
  );

  const available = PROP_GROUP_ORDER.filter((g) => grouped.has(g));
  const active = available.includes(group) ? group : available[0];
  const started = gameStarted(game ?? undefined);
  const closedReason = started
    ? "Kicked off — picks are closed"
    : locked
      ? "This slip is locked"
      : picksLeft <= 0
        ? "Your picks are in"
        : `${picksLeft} pick${picksLeft === 1 ? "" : "s"} left on this slip`;
  const addDisabled = busy || started || locked || picksLeft <= 0;

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
          <div className="sticky -top-4 z-10 -mx-4 -mt-4 bg-chalk px-4 pb-2 pt-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {available.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
                    active === g
                      ? "bg-ink text-lime"
                      : "border border-border text-ink-muted hover:text-ink",
                  )}
                  onClick={() => setGroup(g)}
                >
                  {PROP_GROUP_LABELS[g]}
                </button>
              ))}
            </div>
            {note || onRefresh ? (
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-ink-faint">
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

          {[...(grouped.get(active!) ?? new Map<string, GameProp[]>())].map(
            ([marketLabel, options]) => (
              <section key={marketLabel} className="mb-4">
                <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-ink-faint">
                  {marketLabel}
                </h3>
                <ul>
                  {marketRows(options).map((row) => (
                    <li
                      key={row.key}
                      className={cn(
                        "gap-2 border-b border-border py-2 last:border-b-0",
                        row.alternate
                          ? "block"
                          : "flex items-center justify-between",
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
                                  ? "border-turf bg-turf text-chalk"
                                  : "border-border-strong bg-chalk text-ink hover:border-turf disabled:opacity-45",
                              )}
                            >
                              {added ? <Check className="h-3.5 w-3.5" /> : null}
                              {label ? (
                                <span className={added ? "text-chalk/80" : "text-ink-muted"}>
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
              </section>
            ),
          )}

          {!extendedLoaded && !started ? (
            <button
              type="button"
              disabled={loading}
              onClick={onLoadExtended}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-xs font-bold uppercase tracking-wider text-ink-muted transition hover:border-turf hover:text-ink disabled:opacity-50"
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
