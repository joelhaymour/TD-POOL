"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useLeagueRealtime } from "@/hooks/use-league-realtime";
import { RideBet } from "@/components/betting/ride-bet";
import { LegProgress, legProgressLabel } from "@/components/betting/leg-progress";
import { MemberChip, ResultMark } from "@/components/ui/result-mark";
import {
  LegLineProgress,
  hasLineProgress,
} from "@/components/betting/leg-line-progress";
import { legTitle, gameLabel, actualLabel, legPrice } from "@/lib/props/format";
import {
  gameStarted,
  slipEstimate,
  slipPhase,
  slipStake,
  type SlipPhase,
} from "@/lib/props/slip";
import { cn } from "@/lib/utils/cn";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import type {
  League,
  LeagueMember,
  NflGame,
  NflWeek,
  ParlayWithLegs,
} from "@/lib/types";

const GROUP_TABLES = ["parlays", "parlay_legs", "parlay_share_links"] as const;

const PHASE_BADGE: Record<SlipPhase, { label: string; className: string }> = {
  building: { label: "Building", className: "bg-ink/6 text-ink-muted" },
  locked: { label: "Bet placed", className: "bg-raised text-raised-fg" },
  live: { label: "Live", className: "bg-lime text-accent-fg" },
  busted: { label: "Busted", className: "bg-danger text-white" },
  settled: { label: "Settled", className: "bg-ink/6 text-ink-muted" },
};

type ApiResult = { ok: boolean; status: number; data: Record<string, unknown> };

async function api(path: string, init?: RequestInit): Promise<ApiResult> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

function errorOf(r: ApiResult): string | undefined {
  return typeof r.data.error === "string" ? r.data.error : undefined;
}

/**
 * Every parlay in play, as a tile: the odds and the payout are what people
 * come here for, so they lead. Tap one to see its legs and the links for
 * placing it. Settled slips move to History.
 */
export function ParlayBoard({
  slug,
  league,
  members,
  weeks,
  initialSlips,
  initialGames,
  viewer,
}: {
  slug: string;
  league: League;
  members: LeagueMember[];
  weeks: NflWeek[];
  initialSlips: ParlayWithLegs[];
  initialGames: NflGame[];
  viewer: { memberId: string; isAdmin: boolean };
}) {
  const { toast } = useToast();
  const [slips, setSlips] = useState(initialSlips);
  const [games, setGames] = useState(initialGames);
  const [openId, setOpenId] = useState<string | null>(
    initialSlips.length === 1 ? initialSlips[0].parlay.id : null,
  );

  const refresh = useCallback(async () => {
    try {
      const r = await api(`/api/leagues/${slug}/parlays`);
      if (!r.ok) return;
      setSlips(r.data.slips as ParlayWithLegs[]);
      setGames(r.data.games as NflGame[]);
    } catch {
      // Keep the last good snapshot on a transient error.
    }
  }, [slug]);

  const { connected } = useLeagueRealtime(league.id, refresh, GROUP_TABLES);
  const anyLive = games.some((g) => g.status === "in_progress");
  useEffect(() => {
    const every = anyLive ? 20_000 : connected ? 90_000 : 30_000;
    const id = window.setInterval(() => void refresh(), every);
    return () => window.clearInterval(id);
  }, [anyLive, connected, refresh]);

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const weekById = useMemo(() => new Map(weeks.map((w) => [w.id, w])), [weeks]);
  const nameOf = (memberId: string) =>
    members.find((m) => m.id === memberId)?.display_name ?? null;
  const showMoney = league.betting_mode !== "none";

  async function addShareLink(parlayId: string, url: string, note: string) {
    const r = await api(`/api/leagues/${slug}/parlays/${parlayId}/shares`, {
      method: "POST",
      body: JSON.stringify({ url, note }),
    });
    if (!r.ok) {
      toast({ title: "Link not saved", description: errorOf(r), tone: "error" });
      return false;
    }
    toast({ title: "Link shared", description: "The group can ride it now", tone: "success" });
    await refresh();
    return true;
  }

  async function removeShareLink(parlayId: string, shareId: string) {
    const r = await api(`/api/leagues/${slug}/parlays/${parlayId}/shares/${shareId}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      toast({ title: "Couldn't remove", description: errorOf(r), tone: "error" });
      return;
    }
    await refresh();
  }

  if (slips.length === 0) {
    return (
      <div className="space-y-4">
        <Header count={0} />
        <section className="rounded-2xl border border-dashed border-border-strong bg-chalk p-6 text-center">
          <p className="text-sm text-ink-muted">
            No parlays going yet. Build one and it shows up here for everyone.
          </p>
          <Link
            href={`/${slug}/group`}
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-raised px-5 font-display text-sm font-extrabold uppercase tracking-wider text-lime"
          >
            <Plus className="h-4 w-4" /> Create a parlay
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header count={slips.length} />

      <ul className="space-y-3">
        {slips.map((slip) => {
          const { parlay, legs, shares } = slip;
          const phase = slipPhase(parlay, legs, gamesById);
          const stake = slipStake(parlay, league);
          const estimate = slipEstimate(legs, stake);
          const week = weekById.get(parlay.week_id);
          const isOpen = openId === parlay.id;
          const contributors = [
            ...new Set(legs.map((l) => nameOf(l.member_id)).filter(Boolean)),
          ] as string[];

          return (
            <li
              key={parlay.id}
              className="overflow-hidden rounded-2xl border border-border bg-chalk shadow-card"
            >
              <button
                type="button"
                className="w-full px-4 py-3 text-left"
                onClick={() => setOpenId(isOpen ? null : parlay.id)}
                aria-expanded={isOpen}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-base font-bold uppercase tracking-wide text-ink">
                      {parlay.title}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {week ? `Week ${week.week} · ` : ""}
                      {legs.length} leg{legs.length === 1 ? "" : "s"}
                      {contributors.length > 0 ? ` · ${contributors.join(", ")}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      PHASE_BADGE[phase].className,
                    )}
                  >
                    {PHASE_BADGE[phase].label}
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="flex items-end gap-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                        Est. odds
                      </p>
                      <p className="font-display text-2xl font-extrabold leading-none tracking-tight text-turf">
                        {estimate.american != null
                          ? formatAmerican(estimate.american)
                          : "—"}
                      </p>
                    </div>
                    {showMoney ? (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                          Est. payout
                        </p>
                        <p className="font-display text-2xl font-extrabold leading-none tracking-tight text-ink">
                          {phase === "busted"
                            ? "—"
                            : estimate.payout != null
                              ? formatMoney(estimate.payout, league.currency)
                              : "—"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-ink-faint transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </div>
                <LegProgress legs={legs} gamesById={gamesById} className="mt-3" />
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  {[
                    showMoney ? `${formatMoney(stake, league.currency)} stake` : null,
                    legProgressLabel(legs),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>

              {isOpen ? (
                <div className="border-t border-border px-4 py-3">
                  {legs.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {legs.map((leg) => {
                        const game = gamesById.get(leg.game_id);
                        const actual = actualLabel(leg);
                        const who = nameOf(leg.member_id);
                        return (
                          <li
                            key={leg.id}
                            className={cn(
                              "flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border px-3 py-2.5",
                              leg.result === "won"
                                ? "border-lime/30 bg-lime/[0.07]"
                                : leg.result === "lost"
                                  ? "border-danger/25 bg-danger/[0.06]"
                                  : "border-border bg-chalk",
                            )}
                          >
                            <span className="flex w-5 shrink-0 justify-center">
                              <ResultMark
                                result={leg.result}
                                live={gameStarted(game)}
                              />
                            </span>
                            {who ? <MemberChip name={who} /> : null}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-ink">
                                {legTitle(leg)}
                              </span>
                              <span className="block truncate text-[11px] uppercase tracking-wide text-ink-faint">
                                {[leg.market_label, gameLabel(game), actual]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                            {legPrice(leg.american_odds) ? (
                              <span className="shrink-0 font-display text-sm font-bold text-turf">
                                {legPrice(leg.american_odds)}
                              </span>
                            ) : null}
                            {hasLineProgress(leg) ? (
                              <LegLineProgress leg={leg} className="w-full" />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="py-2 text-sm text-ink-muted">
                      No picks on this parlay yet.
                    </p>
                  )}

                  <div className="mt-3 border-t border-border pt-3">
                    <RideBet
                      shares={shares}
                      members={members}
                      viewerMemberId={viewer.memberId}
                      isAdmin={viewer.isAdmin}
                      tone="light"
                      onAdd={(url, note) => addShareLink(parlay.id, url, note)}
                      onRemove={(shareId) => removeShareLink(parlay.id, shareId)}
                    />
                  </div>

                  {phase === "building" ? (
                    <Link
                      href={`/${slug}/group?slip=${parlay.id}`}
                      className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-border-strong font-display text-sm font-bold uppercase tracking-wide text-ink transition hover:border-turf"
                    >
                      <Plus className="h-4 w-4" /> Add picks
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Header({ count }: { count: number }) {
  return (
    <div>
      <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
        Parlays
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {count === 0
          ? "Every parlay in play shows up here."
          : `${count} in play · settled ones move to History`}
      </p>
    </div>
  );
}
