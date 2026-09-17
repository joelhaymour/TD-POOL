"use client";

import { useState } from "react";
import { ChevronDown, Image as ImageIcon, Trash2, Users } from "lucide-react";
import { LegProgress, legProgressLabel } from "@/components/betting/leg-progress";
import { LegRow } from "@/components/betting/leg-row";
import { RideBet } from "@/components/betting/ride-bet";
import { BookBadge } from "@/components/tickets/book-badge";
import { Sheet } from "@/components/ui/sheet";
import { MemberChip } from "@/components/ui/result-mark";
import { gameStarted, slipEstimate, slipPhase } from "@/lib/props/slip";
import { ticketPhaseLabel } from "@/lib/tickets/format";
import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import type {
  LeagueMember,
  LegResult,
  NflGame,
  ParlayWithLegs,
} from "@/lib/types";

/**
 * One posted bet. The numbers the slip printed lead — odds, stake, to win —
 * then a bar per leg. Open it for the legs with their running stats, the
 * original screenshot, the ride link and who's along for it.
 */
export function TicketCard({
  ticket,
  gamesById,
  members,
  viewer,
  currency,
  defaultOpen = false,
  onRide,
  onDelete,
  onAddShare,
  onRemoveShare,
  onGrade,
}: {
  ticket: ParlayWithLegs;
  gamesById: Map<string, NflGame>;
  members: LeagueMember[];
  viewer: { memberId: string; isAdmin: boolean };
  currency: "USD" | "CAD";
  defaultOpen?: boolean;
  onRide: (riding: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddShare: (url: string, note: string) => Promise<boolean>;
  onRemoveShare: (shareId: string) => Promise<void>;
  onGrade: (legId: string, result: LegResult | "auto") => Promise<void>;
}) {
  const { parlay, legs, shares, rides } = ticket;
  const [open, setOpen] = useState(defaultOpen);
  const [picture, setPicture] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const phase = slipPhase(parlay, legs, gamesById);
  const badge = ticketPhaseLabel(phase, parlay.result);
  const poster = members.find((m) => m.id === parlay.created_by_member_id);
  const posterName = poster?.display_name ?? "Former member";
  const mine = parlay.created_by_member_id === viewer.memberId;
  const riding = rides.some((r) => r.member_id === viewer.memberId);
  const riderNames = rides
    .map((r) => members.find((m) => m.id === r.member_id)?.display_name)
    .filter((n): n is string => Boolean(n));

  const stake = parlay.stake;
  const estimate = slipEstimate(legs, stake ?? 0);
  const odds = parlay.book_odds ?? estimate.american;
  const toWin =
    parlay.settled_at && parlay.result !== "pending"
      ? parlay.payout
      : (parlay.book_payout ?? estimate.payout);
  const showMoney = stake != null;

  async function toggleRide() {
    setBusy(true);
    try {
      await onRide(!riding);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-chalk shadow-card">
      <button
        type="button"
        className="w-full px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <MemberChip name={posterName} />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-muted">
            {posterName}
            {mine ? (
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-turf">
                You
              </span>
            ) : null}
          </span>
          <BookBadge book={parlay.sportsbook} />
          <span
            className={cn(
              "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              badge.className,
            )}
          >
            {badge.label}
          </span>
        </div>

        <h3 className="mt-2 line-clamp-2 font-display text-base font-bold uppercase tracking-wide text-ink">
          {parlay.title}
        </h3>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex items-end gap-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                Odds
              </p>
              <p className="font-display text-2xl font-extrabold leading-none tracking-tight text-turf">
                {odds != null ? formatAmerican(odds) : "—"}
              </p>
            </div>
            {showMoney ? (
              <>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                    Stake
                  </p>
                  <p className="font-display text-2xl font-extrabold leading-none tracking-tight text-ink">
                    {formatMoney(stake, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                    {parlay.settled_at ? "Paid" : "To win"}
                  </p>
                  <p
                    className={cn(
                      "font-display text-2xl font-extrabold leading-none tracking-tight",
                      parlay.result === "won" ? "text-lime" : "text-ink",
                    )}
                  >
                    {phase === "busted" || parlay.result === "lost"
                      ? "—"
                      : toWin != null
                        ? formatMoney(toWin, currency)
                        : "—"}
                  </p>
                </div>
              </>
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-ink-faint transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </div>

        <LegProgress legs={legs} gamesById={gamesById} className="mt-3" />
        <p className="mt-1.5 text-[11px] text-ink-faint">
          {[
            `${legs.length} leg${legs.length === 1 ? "" : "s"}`,
            legProgressLabel(legs),
            rides.length > 0
              ? `${rides.length} riding`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </button>

      {open ? (
        <div className="border-t border-border px-4 py-3">
          <ul className="flex flex-col gap-2">
            {legs.map((leg) => {
              const game = gamesById.get(leg.game_id);
              const started = gameStarted(game);
              return (
                <LegRow
                  key={leg.id}
                  leg={leg}
                  game={game}
                  onGrade={
                    viewer.isAdmin && started
                      ? (result) => void onGrade(leg.id, result)
                      : undefined
                  }
                />
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ticket.screenshot_url ? (
              <button
                type="button"
                className="flex h-10 items-center gap-1.5 rounded-xl border border-border-strong px-3 text-xs font-bold uppercase tracking-wide text-ink-muted transition hover:text-ink"
                onClick={() => setPicture(true)}
              >
                <ImageIcon className="h-4 w-4" aria-hidden /> The slip
              </button>
            ) : null}
            {!mine && phase !== "settled" && phase !== "busted" ? (
              <button
                type="button"
                disabled={busy}
                className={cn(
                  "flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold uppercase tracking-wide transition disabled:opacity-50",
                  riding
                    ? "bg-lime text-accent-fg"
                    : "border border-border-strong text-ink-muted hover:text-ink",
                )}
                onClick={() => void toggleRide()}
              >
                <Users className="h-4 w-4" aria-hidden />
                {riding ? "Riding" : "I'm riding"}
              </button>
            ) : null}
            {mine || viewer.isAdmin ? (
              <button
                type="button"
                className="ml-auto flex h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-bold uppercase tracking-wide text-ink-faint transition hover:text-danger"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete ticket"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>

          {riderNames.length > 0 ? (
            <div className="mt-3 flex items-center gap-1.5">
              <div className="flex -space-x-1.5">
                {riderNames.slice(0, 6).map((name) => (
                  <MemberChip
                    key={name}
                    name={name}
                    className="ring-2 ring-field"
                  />
                ))}
              </div>
              <p className="text-[11px] text-ink-faint">
                {riderNames.length <= 3
                  ? riderNames.join(", ")
                  : `${riderNames.slice(0, 2).join(", ")} and ${riderNames.length - 2} more`}{" "}
                riding
              </p>
            </div>
          ) : null}

          <div className="mt-3 border-t border-border pt-3">
            <RideBet
              shares={shares}
              members={members}
              viewerMemberId={viewer.memberId}
              isAdmin={viewer.isAdmin}
              canAdd={mine}
              tone="light"
              onAdd={onAddShare}
              onRemove={onRemoveShare}
            />
          </div>
        </div>
      ) : null}

      <Sheet
        open={picture}
        onClose={() => setPicture(false)}
        title={parlay.title}
        description={`${posterName}'s slip, as posted`}
      >
        {ticket.screenshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ticket.screenshot_url}
            alt={`${posterName}'s bet slip`}
            className="mx-auto max-h-[70vh] rounded-xl object-contain"
          />
        ) : null}
      </Sheet>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Take this ticket down?"
        description={`"${parlay.title}" goes for everyone, rides included. This can't be undone.`}
      >
        <div className="space-y-2 pb-2">
          <button
            type="button"
            className="h-12 w-full rounded-xl bg-danger font-display text-sm font-extrabold uppercase tracking-wider text-white transition active:scale-[0.98]"
            onClick={() => {
              setConfirmDelete(false);
              void onDelete();
            }}
          >
            Delete ticket
          </button>
          <button
            type="button"
            className="h-11 w-full rounded-xl border border-border font-semibold text-ink"
            onClick={() => setConfirmDelete(false)}
          >
            Keep it
          </button>
        </div>
      </Sheet>
    </li>
  );
}
