"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PARLAY_TABLES, useLeagueRealtime } from "@/hooks/use-league-realtime";
import { PostTicketSheet } from "@/components/tickets/post-ticket-sheet";
import { TicketCard } from "@/components/tickets/ticket-card";
import { apiError, apiJson } from "@/lib/api/client";
import { gameStarted, slipPhase } from "@/lib/props/slip";
import type {
  League,
  LeagueMember,
  LegResult,
  NflGame,
  ParlayWithLegs,
} from "@/lib/types";

type Feed = { tickets: ParlayWithLegs[]; games: NflGame[] };

/**
 * Every ticket the league is following: what's being played now on top,
 * then what's coming, then what settled this week. Older settled tickets
 * live in History.
 */
export function TicketFeed({
  slug,
  league,
  members,
  initialTickets,
  initialGames,
  viewer,
}: {
  slug: string;
  league: League;
  members: LeagueMember[];
  initialTickets: ParlayWithLegs[];
  initialGames: NflGame[];
  viewer: { memberId: string; isAdmin: boolean };
}) {
  const { toast } = useToast();
  const [feed, setFeed] = useState<Feed>({ tickets: initialTickets, games: initialGames });
  const [posting, setPosting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await apiJson<Feed>(`/api/leagues/${slug}/tickets`);
      if (r.ok) setFeed({ tickets: r.data.tickets, games: r.data.games });
    } catch {
      // Keep the last good snapshot on a transient error.
    }
  }, [slug]);

  const { connected } = useLeagueRealtime(league.id, refresh, PARLAY_TABLES);
  const anyLive = feed.games.some((g) => g.status === "in_progress");
  useEffect(() => {
    const every = anyLive ? 20_000 : connected ? 90_000 : 30_000;
    const id = window.setInterval(() => void refresh(), every);
    return () => window.clearInterval(id);
  }, [anyLive, connected, refresh]);

  const gamesById = useMemo(
    () => new Map(feed.games.map((g) => [g.id, g])),
    [feed.games],
  );

  const groups = useMemo(() => {
    const firstKick = (t: ParlayWithLegs) =>
      Math.min(
        ...t.legs.map((l) => Date.parse(gamesById.get(l.game_id)?.kickoff_at ?? "")).filter(Number.isFinite),
        Number.POSITIVE_INFINITY,
      );
    const live: ParlayWithLegs[] = [];
    const upcoming: ParlayWithLegs[] = [];
    const settled: ParlayWithLegs[] = [];
    for (const t of feed.tickets) {
      const phase = slipPhase(t.parlay, t.legs, gamesById);
      if (phase === "settled") settled.push(t);
      else if (phase === "live" || phase === "busted") live.push(t);
      else if (t.legs.some((l) => gameStarted(gamesById.get(l.game_id)))) live.push(t);
      else upcoming.push(t);
    }
    upcoming.sort((a, b) => firstKick(a) - firstKick(b));
    settled.sort(
      (a, b) => Date.parse(b.parlay.settled_at!) - Date.parse(a.parlay.settled_at!),
    );
    return { live, upcoming, settled };
  }, [feed.tickets, gamesById]);

  async function ride(ticketId: string, riding: boolean) {
    const r = await apiJson(`/api/leagues/${slug}/tickets/${ticketId}/ride`, {
      method: riding ? "PUT" : "DELETE",
    });
    if (!r.ok) {
      toast({ title: "Couldn't update", description: apiError(r), tone: "error" });
      return;
    }
    await refresh();
  }

  async function remove(ticketId: string) {
    const r = await apiJson(`/api/leagues/${slug}/tickets/${ticketId}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      toast({ title: "Couldn't delete", description: apiError(r), tone: "error" });
      return;
    }
    toast({ title: "Ticket taken down", tone: "success" });
    await refresh();
  }

  async function addShare(ticketId: string, url: string, note: string) {
    const r = await apiJson(`/api/leagues/${slug}/parlays/${ticketId}/shares`, {
      method: "POST",
      body: JSON.stringify({ url, note }),
    });
    if (!r.ok) {
      toast({ title: "Link not saved", description: apiError(r), tone: "error" });
      return false;
    }
    toast({ title: "Link shared", description: "The league can ride it now", tone: "success" });
    await refresh();
    return true;
  }

  async function removeShare(ticketId: string, shareId: string) {
    const r = await apiJson(
      `/api/leagues/${slug}/parlays/${ticketId}/shares/${shareId}`,
      { method: "DELETE" },
    );
    if (!r.ok) {
      toast({ title: "Couldn't remove", description: apiError(r), tone: "error" });
      return;
    }
    await refresh();
  }

  async function grade(ticketId: string, legId: string, result: LegResult | "auto") {
    const r = await apiJson(
      `/api/leagues/${slug}/parlays/${ticketId}/legs/${legId}`,
      { method: "PATCH", body: JSON.stringify({ result }) },
    );
    if (!r.ok) {
      toast({ title: "Couldn't grade", description: apiError(r), tone: "error" });
      return;
    }
    await refresh();
  }

  const renderGroup = (label: string, list: ParlayWithLegs[], blurb?: string) =>
    list.length === 0 ? null : (
      <section key={label} className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-ink-muted">
            {label}
          </h3>
          {blurb ? <span className="text-[11px] text-ink-faint">{blurb}</span> : null}
        </div>
        <ul className="space-y-3">
          {list.map((t) => (
            <TicketCard
              key={t.parlay.id}
              ticket={t}
              gamesById={gamesById}
              members={members}
              viewer={viewer}
              currency={league.currency}
              defaultOpen={feed.tickets.length === 1}
              onRide={(riding) => ride(t.parlay.id, riding)}
              onDelete={() => remove(t.parlay.id)}
              onAddShare={(url, note) => addShare(t.parlay.id, url, note)}
              onRemoveShare={(shareId) => removeShare(t.parlay.id, shareId)}
              onGrade={(legId, result) => grade(t.parlay.id, legId, result)}
            />
          ))}
        </ul>
      </section>
    );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-ink">
            Tickets
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {feed.tickets.length === 0
              ? "Bets the league placed, followed live."
              : `${feed.tickets.length} posted · settled ones move to History`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPosting(true)}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-lime px-4 font-display text-sm font-extrabold uppercase tracking-wider text-accent-fg transition active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" /> Post
        </button>
      </div>

      {feed.tickets.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border-strong bg-chalk p-6 text-center">
          <p className="text-sm text-ink-muted">
            Placed a bet? Post the slip and the league follows every leg as the
            games are played — and rides it with one tap.
          </p>
          <button
            type="button"
            onClick={() => setPosting(true)}
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-raised px-5 font-display text-sm font-extrabold uppercase tracking-wider text-lime"
          >
            <Plus className="h-4 w-4" /> Post a ticket
          </button>
        </section>
      ) : (
        <>
          {renderGroup("Live", groups.live)}
          {renderGroup("Upcoming", groups.upcoming)}
          {renderGroup("Settled this week", groups.settled)}
        </>
      )}

      <PostTicketSheet
        open={posting}
        onClose={() => setPosting(false)}
        slug={slug}
        currency={league.currency}
        onPosted={async () => {
          toast({ title: "Ticket posted", description: "The league can see it now", tone: "success" });
          await refresh();
        }}
      />
    </div>
  );
}
