"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, X } from "lucide-react";
import { TEAM_ABBR_TO_FULL } from "@/lib/nfl/teams";
import { gameLabel, legTitle } from "@/lib/props/format";
import {
  isAlternateMarket,
  PROP_GROUP_LABELS,
  PROP_GROUP_ORDER,
  PROP_MARKETS,
  propMarketDef,
} from "@/lib/props/markets";
import { legIssues, type TicketLegDraft } from "@/lib/tickets/normalize";
import { cn } from "@/lib/utils/cn";
import type { NflGame } from "@/lib/types";

const inputClass =
  "h-10 w-full rounded-lg border border-transparent bg-ink/[0.05] px-2.5 focus:bg-white text-sm font-semibold text-ink outline-none focus:border-turf";
const labelClass =
  "mb-1 block text-[11px] font-semibold text-ink-faint";

const TD_SCORER = new Set(["player_anytime_td", "player_1st_td", "player_last_td"]);
const isTeamMarket = (key: string) => /^(h2h|spreads|alternate_spreads)/.test(key);
const isTotalMarket = (key: string) => /^(totals|alternate_totals)/.test(key);

function needsPlayer(key: string): boolean {
  return !isTeamMarket(key) && !isTotalMarket(key) && key !== "team_totals";
}

function needsLine(key: string): boolean {
  return !TD_SCORER.has(key) && !key.startsWith("h2h");
}

function teamsOf(game: NflGame | undefined): string[] {
  if (!game) return [];
  return [game.away_team, game.home_team].map((a) => TEAM_ABBR_TO_FULL[a] ?? a);
}

function sideOptions(key: string, game: NflGame | undefined): string[] {
  if (isTeamMarket(key)) return teamsOf(game);
  if (TD_SCORER.has(key)) return ["Yes", "No"];
  if (isAlternateMarket(key)) return ["Over"];
  return ["Over", "Under"];
}

/** Grouped the way the prop board is, alternate ladders beside their line. */
const MARKET_GROUPS = PROP_GROUP_ORDER.map((group) => ({
  group,
  label: PROP_GROUP_LABELS[group],
  markets: PROP_MARKETS.filter((m) => m.group === group),
}));

/**
 * One leg on the review screen. The read is shown as a line the member can
 * confirm at a glance; anything the read could not place opens its fields.
 */
export function LegEditor({
  leg,
  games,
  onChange,
  onRemove,
}: {
  leg: TicketLegDraft;
  games: NflGame[];
  onChange: (next: TicketLegDraft) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(leg.issues.length > 0 || !leg.market_key);
  const game = games.find((g) => g.id === leg.game_id);
  const key = leg.market_key ?? "";
  const def = key ? propMarketDef(key) : null;
  const sides = sideOptions(key, game);

  function update(patch: Partial<TicketLegDraft>) {
    const next = { ...leg, ...patch };
    const nextKey = next.market_key ?? "";
    next.market_label = nextKey ? (propMarketDef(nextKey)?.label ?? "") : "";
    if (nextKey && isTeamMarket(nextKey)) next.player_name = null;
    if (nextKey && !needsLine(nextKey)) next.line = null;
    // A side that no longer fits the market (or the game's teams) is cleared
    // rather than carried along wrong.
    const allowed = sideOptions(nextKey, games.find((g) => g.id === next.game_id));
    if (nextKey && !allowed.includes(next.outcome_label)) {
      next.outcome_label = allowed.length === 1 ? allowed[0] : "";
    }
    next.issues = legIssues(next);
    onChange(next);
  }

  const title = def
    ? legTitle({
        market_key: key,
        player_name: leg.player_name,
        outcome_label: leg.outcome_label || "…",
        line: leg.line,
      })
    : leg.raw_text || "New leg";
  const detail = [def?.label, gameLabel(game)].filter(Boolean).join(" · ");
  const flagged = leg.issues.length > 0;
  const shaky = !flagged && leg.confidence === "low";

  return (
    <li
      className={cn(
        "rounded-xl border bg-chalk",
        flagged
          ? "border-warning/50"
          : shaky
            ? "border-warning/30"
            : "border-border",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {flagged || shaky ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{title}</span>
            <span
              className={cn(
                "block truncate text-[11px]",
                flagged ? "text-warning" : "text-ink-faint",
              )}
            >
              {flagged
                ? leg.issues.join(" · ")
                : shaky
                  ? "Read wasn't sure — check this one"
                  : detail || "Tap to fill in"}
            </span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-ink-faint transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="-mr-1 shrink-0 rounded-lg p-1 text-ink-faint hover:text-danger"
          aria-label="Remove leg"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {open ? (
        <div className="grid grid-cols-2 gap-2 border-t border-border px-3 py-3">
          <label className="col-span-2 block">
            <span className={labelClass}>Game</span>
            <select
              className={inputClass}
              value={leg.game_id ?? ""}
              onChange={(e) => update({ game_id: e.target.value || null })}
            >
              <option value="">Pick the game</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {gameLabel(g)} ·{" "}
                  {new Date(g.kickoff_at).toLocaleString("en-US", {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-2 block">
            <span className={labelClass}>Market</span>
            <select
              className={inputClass}
              value={key}
              onChange={(e) => update({ market_key: e.target.value || null })}
            >
              <option value="">Pick the market</option>
              {MARKET_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.label}>
                  {g.markets.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {key && needsPlayer(key) ? (
            <label className="col-span-2 block">
              <span className={labelClass}>Player</span>
              <input
                className={inputClass}
                value={leg.player_name ?? ""}
                placeholder="As printed on the slip"
                autoComplete="off"
                onChange={(e) => update({ player_name: e.target.value || null })}
              />
            </label>
          ) : null}

          {key === "team_totals" ? (
            <label className="col-span-2 block">
              <span className={labelClass}>Team</span>
              <select
                className={inputClass}
                value={leg.player_name ?? ""}
                onChange={(e) => update({ player_name: e.target.value || null })}
              >
                <option value="">Which team?</option>
                {teamsOf(game).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {key ? (
            <label className="block">
              <span className={labelClass}>{isTeamMarket(key) ? "Team" : "Side"}</span>
              <select
                className={inputClass}
                value={leg.outcome_label}
                disabled={sides.length === 1}
                onChange={(e) => update({ outcome_label: e.target.value })}
              >
                {sides.length !== 1 ? <option value="">Choose</option> : null}
                {sides.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {key && needsLine(key) ? (
            <label className="block">
              <span className={labelClass}>
                {isAlternateMarket(key) ? "At least" : isTeamMarket(key) ? "Spread" : "Line"}
              </span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={leg.line ?? ""}
                placeholder={isTeamMarket(key) ? "Spread" : "Line"}
                onChange={(e) => {
                  const n = Number.parseFloat(e.target.value);
                  update({ line: Number.isFinite(n) ? n : null });
                }}
              />
            </label>
          ) : null}

          {key ? (
            <label className="block">
              <span className={labelClass}>Odds (optional)</span>
              <input
                className={inputClass}
                inputMode="numeric"
                value={leg.american_odds ?? ""}
                placeholder="American"
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value.replace(/[^0-9-]/g, ""), 10);
                  update({ american_odds: Number.isFinite(n) && n !== 0 ? n : null });
                }}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** An untouched leg the member adds by hand. */
export function blankLeg(key: string): TicketLegDraft {
  return {
    key,
    raw_text: "",
    game_id: null,
    market_key: null,
    market_label: "",
    player_name: null,
    outcome_label: "",
    line: null,
    american_odds: null,
    confidence: "high",
    issues: ["Pick the game", "Pick the market"],
  };
}
