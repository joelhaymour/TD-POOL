"use client";

import { useState } from "react";
import { Bell, ChevronDown, Image as ImageIcon, Trash2, Users } from "lucide-react";
import { ReactionButtons } from "@/components/social/reaction-buttons";
import { LegProgress, legProgressLabel } from "@/components/betting/leg-progress";
import { LegRow } from "@/components/betting/leg-row";
import { RideBet } from "@/components/betting/ride-bet";
import { BookBadge } from "@/components/tickets/book-badge";
import { Button } from "@/components/ui/button";
import { PhotoViewer } from "@/components/ui/photo-viewer";
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
  ReactionSummary,
} from "@/lib/types";

/**
 * One posted bet: who posted it, the odds and payout, a bar per leg, and one
 * quiet row for thumbs, ride, follow and the slip. Open it for the legs in
 * full, who's riding, the ride link and delete.
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
  onReact,
  onFollow,
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
  onReact: (value: -1 | 0 | 1) => Promise<ReactionSummary | null>;
  onFollow: (following: boolean) => Promise<void>;
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
  const dead = phase === "busted" || parlay.result === "lost";
  const toWin =
    parlay.settled_at && parlay.result !== "pending"
      ? parlay.payout
      : (parlay.book_payout ?? estimate.payout);
  const showMoney = stake != null;

  const reactions = ticket.reactions ?? { up: 0, down: 0, mine: 0 as const };
  const following = ticket.follow?.mine ?? false;

  async function toggleFollow() {
    setBusy(true);
    try {
      await onFollow(!following);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRide() {
    setBusy(true);
    try {
      await onRide(!riding);
    } finally {
      setBusy(false);
    }
  }

  const live = !mine && phase !== "settled" && phase !== "busted";

  return (
    <li className="overflow-hidden rounded-[1.4rem] bg-chalk shadow-card">
      <button
        type="button"
        className="w-full px-4 pb-2 pt-3.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {/* Who, then the bet's numbers, then a bar per leg. */}
        <div className="flex items-center gap-2">
          <MemberChip name={posterName} className="h-7 w-7 text-[10px]" />
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
            {posterName}
            {mine ? <span className="ml-1 font-normal text-ink-faint">(you)</span> : null}
          </h3>
          <BookBadge book={parlay.sportsbook} />
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              badge.className,
            )}
          >
            {phase === "live" ? (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden />
            ) : null}
            {badge.label}
          </span>
        </div>

        <div className="mt-2.5 flex items-baseline gap-3">
          <span className="shrink-0 font-display text-[28px] font-bold leading-none tracking-tight text-ink">
            {odds != null ? formatAmerican(odds) : "—"}
          </span>
          {showMoney ? (
            <span className="min-w-0 truncate text-sm text-ink-muted">
              {formatMoney(stake, currency)} to win{" "}
              <span
                className={cn(
                  "font-display text-[17px] font-bold text-ink",
                  parlay.result === "won" && "text-turf",
                  dead && "text-ink-faint line-through",
                )}
              >
                {toWin != null ? formatMoney(toWin, currency) : "—"}
              </span>
            </span>
          ) : null}
        </div>

        {/* The bars carry the picks' names, so the bet reads without opening it. */}
        <LegProgress legs={legs} gamesById={gamesById} labels className="mt-3" />
      </button>

      {/* The small things, in one quiet row. */}
      <div className="flex items-center gap-1.5 px-3 pb-3 pt-1">
        <ReactionButtons size="sm" summary={reactions} onVote={onReact} disabled={mine} />
        {live ? (
          <button
            type="button"
            disabled={busy}
            aria-pressed={riding}
            className={cn(
              "pressable flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold disabled:opacity-50",
              riding ? "bg-ink text-on-ink" : "bg-ink/[0.06] text-ink-muted hover:text-ink",
            )}
            onClick={() => void toggleRide()}
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            {riding ? "Riding" : "Ride"}
            {rides.length > 0 ? <span className="opacity-60">{rides.length}</span> : null}
          </button>
        ) : null}
        {/* Riders and the poster get updates anyway; following is for the rest. */}
        {!mine && !riding && phase !== "settled" ? (
          <button
            type="button"
            disabled={busy}
            aria-pressed={following}
            className={cn(
              "pressable flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold disabled:opacity-50",
              following ? "bg-ink text-on-ink" : "bg-ink/[0.06] text-ink-muted hover:text-ink",
            )}
            onClick={() => void toggleFollow()}
          >
            <Bell className="h-3.5 w-3.5" aria-hidden />
            {following ? "Following" : "Follow"}
          </button>
        ) : null}
        {ticket.screenshot_url ? (
          <button
            type="button"
            aria-label="See the slip"
            className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-muted hover:text-ink"
            onClick={() => setPicture(true)}
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Hide details" : "Show details"}
          className="ml-auto flex h-8 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full pl-2 pr-1 text-xs font-medium text-ink-faint"
        >
          {!live && rides.length > 0 ? `${rides.length} riding` : null}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {open ? (
        <div className="border-t border-ink/[0.06] px-4 py-3">
          <p className="mb-2 text-xs text-ink-faint">
            {[legs.length === 1 ? "Single" : `${legs.length}-leg parlay`, legProgressLabel(legs)]
              .filter(Boolean)
              .join(" · ")}
          </p>
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

          {riderNames.length > 0 ? (
            <div className="mt-3 flex items-center gap-1.5">
              <div className="flex -space-x-1.5">
                {riderNames.slice(0, 6).map((name) => (
                  <MemberChip key={name} name={name} className="ring-2 ring-chalk" />
                ))}
              </div>
              <p className="text-xs text-ink-faint">
                {riderNames.length <= 3
                  ? riderNames.join(", ")
                  : `${riderNames.slice(0, 2).join(", ")} and ${riderNames.length - 2} more`}{" "}
                riding
              </p>
            </div>
          ) : null}

          {shares.length > 0 || mine ? (
            <div className="mt-3 border-t border-ink/[0.06] pt-3">
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
          ) : null}

          {mine || viewer.isAdmin ? (
            <button
              type="button"
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-ink-faint transition hover:text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete ticket
            </button>
          ) : null}
        </div>
      ) : null}

      <PhotoViewer
        open={picture}
        src={ticket.screenshot_url ?? null}
        alt={`${posterName}'s bet slip`}
        title={`${posterName}'s slip`}
        onClose={() => setPicture(false)}
      />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Take this ticket down?"
        description="It goes for everyone, rides included. This can't be undone."
      >
        <div className="space-y-2 pb-2">
          <Button
            variant="danger"
            size="lg"
            fullWidth
            onClick={() => {
              setConfirmDelete(false);
              void onDelete();
            }}
          >
            Delete ticket
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
        </div>
      </Sheet>
    </li>
  );
}
