"use client";

import { Plus } from "lucide-react";
import { LegEditor } from "@/components/tickets/leg-editor";
import type { TicketLegDraft } from "@/lib/tickets/normalize";
import type { Currency, NflGame } from "@/lib/types";

export const ticketInputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";
export const ticketLabelClass =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint";

export type TicketMoney = { stake: string; odds: string; payout: string; shareText: string };

/**
 * The editable body of a ticket: its legs, what was staked, the odds, the
 * return and the ride link. Shared by the league's Post sheet and /share.
 */
export function TicketFields({
  legs,
  onLegChange,
  onLegRemove,
  onAddLeg,
  games,
  money,
  onMoney,
  currency,
}: {
  legs: TicketLegDraft[];
  onLegChange: (next: TicketLegDraft) => void;
  onLegRemove: (key: string) => void;
  onAddLeg: () => void;
  games: NflGame[];
  money: TicketMoney;
  onMoney: (patch: Partial<TicketMoney>) => void;
  currency: Currency;
}) {
  return (
    <>
      <div>
        <span className={ticketLabelClass}>Legs</span>
        <ul className="space-y-2">
          {legs.map((leg) => (
            <LegEditor
              key={leg.key}
              leg={leg}
              games={games}
              onChange={onLegChange}
              onRemove={() => onLegRemove(leg.key)}
            />
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-xs font-bold uppercase tracking-wide text-ink-muted transition hover:text-ink"
          onClick={onAddLeg}
        >
          <Plus className="h-4 w-4" /> Add a leg
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Word placeholders only: a number here reads as a value
            the app filled in, and an empty box must look empty. */}
        <label className="block">
          <span className={ticketLabelClass}>Stake ({currency})</span>
          <input
            className={ticketInputClass}
            inputMode="decimal"
            value={money.stake}
            placeholder="Wager"
            onChange={(e) => onMoney({ stake: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={ticketLabelClass}>Odds</span>
          <input
            className={ticketInputClass}
            inputMode="numeric"
            value={money.odds}
            placeholder="American"
            onChange={(e) => onMoney({ odds: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={ticketLabelClass}>To win</span>
          <input
            className={ticketInputClass}
            inputMode="decimal"
            value={money.payout}
            placeholder="Return"
            onChange={(e) => onMoney({ payout: e.target.value })}
          />
        </label>
      </div>

      <label className="block">
        <span className={ticketLabelClass}>Share link</span>
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          className={ticketInputClass}
          value={money.shareText}
          placeholder="https://…"
          onChange={(e) => onMoney({ shareText: e.target.value })}
        />
      </label>
    </>
  );
}

/** What the tickets POST route takes, built from the review fields. */
export function ticketPayload(book: string | null, money: TicketMoney, legs: TicketLegDraft[]) {
  const num = (s: string) => {
    const n = Number.parseFloat(s.replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const odds = num(money.odds);
  return {
    sportsbook: book,
    stake: num(money.stake),
    book_odds: odds != null && odds !== 0 ? Math.round(odds) : null,
    book_payout: num(money.payout),
    share_url: money.shareText.trim() || undefined,
    legs: legs.map((l) => ({
      game_id: l.game_id,
      market_key: l.market_key,
      player_name: l.player_name,
      outcome_label: l.outcome_label,
      line: l.line,
      american_odds: l.american_odds,
    })),
  };
}
