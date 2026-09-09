"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  americanToDecimal,
  combineParlayDecimal,
  decimalToAmerican,
  estimatePayout,
  formatAmerican,
  formatMoney,
  isValidAmericanOdds,
} from "@/lib/utils/odds";

export type BetSlipLeg = {
  id: string;
  memberName: string;
  playerName: string;
  team?: string;
  /** Null when no sportsbook price is available for this pick. */
  americanOdds: number | null;
};

export type BetSlipProps = {
  weekNumber: number;
  legs: BetSlipLeg[];
  stake: number | null;
  currency?: "USD" | "CAD";
  showMoney?: boolean;
  className?: string;
};

export function BetSlip({
  weekNumber,
  legs,
  stake,
  currency = "USD",
  showMoney = true,
  className,
}: BetSlipProps) {
  const [copied, setCopied] = useState(false);

  // Parlay math needs a real price for every leg; one missing quote makes the
  // combined number meaningless, so we show nothing rather than a guess.
  const pricedOdds = legs.map((l) => l.americanOdds);
  const allPriced =
    legs.length > 0 && pricedOdds.every(isValidAmericanOdds);
  const combinedDecimal = allPriced
    ? combineParlayDecimal(pricedOdds.map((o) => americanToDecimal(o)))
    : null;
  const combinedAmerican =
    combinedDecimal != null ? decimalToAmerican(combinedDecimal) : null;
  const payoutEstimate =
    showMoney && stake != null && combinedDecimal != null
      ? estimatePayout(stake, combinedDecimal)
      : null;

  async function copyPicks() {
    const lines = [
      `Week ${weekNumber} TD Pool Parlay`,
      ...legs.map(
        (l, i) =>
          `${i + 1}. ${l.memberName}: ${l.playerName}${l.team ? ` (${l.team})` : ""} ${formatAmerican(l.americanOdds)}`,
      ),
      combinedAmerican != null
        ? `Combined (est.): ${formatAmerican(combinedAmerican)}`
        : "",
      stake != null && showMoney
        ? `Stake: ${formatMoney(stake, currency)}`
        : "",
      payoutEstimate
        ? `Est. payout: ${formatMoney(payoutEstimate.payout, currency)}`
        : "",
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op; clipboard may be unavailable
    }
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-chalk shadow-card",
        className,
      )}
    >
      <div className="border-b border-border bg-ink px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-lime">
          Bet Slip
        </p>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-chalk">
          Week {weekNumber} Legs
        </h2>
      </div>

      {legs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-muted">
          No picks yet — the slip fills as members lock players.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {legs.map((leg, index) => (
            <li
              key={leg.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-field font-display text-sm font-bold text-ink">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {leg.playerName}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {leg.memberName}
                  {leg.team ? ` · ${leg.team}` : ""}
                </p>
              </div>
              <span className="font-display text-lg font-extrabold text-turf">
                {formatAmerican(leg.americanOdds)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="space-y-3 border-t border-border bg-field/60 px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
              Combined odds (est.)
            </p>
            <p className="font-display text-3xl font-extrabold text-ink">
              {combinedAmerican != null
                ? formatAmerican(combinedAmerican)
                : "—"}
            </p>
          </div>
          {showMoney ? (
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                Stake → payout
              </p>
              <p className="text-sm font-semibold text-ink">
                {stake != null ? formatMoney(stake, currency) : "—"}
                <span className="mx-1 text-ink-faint">→</span>
                {payoutEstimate
                  ? formatMoney(payoutEstimate.payout, currency)
                  : "—"}
              </p>
            </div>
          ) : null}
        </div>

        <Button
          variant="secondary"
          fullWidth
          disabled={legs.length === 0}
          onClick={() => void copyPicks()}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy Picks
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
