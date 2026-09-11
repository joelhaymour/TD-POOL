"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Lock, Plus, Trash2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useLeagueRealtime } from "@/hooks/use-league-realtime";
import { SlipHero } from "@/components/betting/slip-hero";
import { FanduelLauncher } from "@/components/betting/fanduel-launcher";
import { PropPickerSheet } from "@/components/betting/prop-picker-sheet";
import { LegRow } from "@/components/betting/leg-row";
import {
  gameStarted,
  slipEstimate,
  slipPhase,
  slipStake,
  type SlipPhase,
} from "@/lib/props/slip";
import { cn } from "@/lib/utils/cn";
import { calculateWeeklyStake, formatMoney } from "@/lib/utils/odds";
import type {
  GameProp,
  League,
  LeagueMember,
  LegResult,
  NflGame,
  NflWeek,
  ParlayWithLegs,
} from "@/lib/types";

const GROUP_TABLES = ["parlays", "parlay_legs"] as const;

type Picker = {
  game: NflGame;
  props: GameProp[];
  loading: boolean;
  note: string | null;
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

function gameStatusLabel(game: NflGame): string {
  if (game.status === "final") return "Final";
  if (game.status === "in_progress") return "Live";
  if (game.status === "canceled") return "Canceled";
  if (game.status === "postponed") return "Postponed";
  if (gameStarted(game)) return "Kicked off";
  return new Date(game.kickoff_at).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const PHASE_DOT: Record<SlipPhase, string> = {
  building: "bg-ink/25",
  locked: "bg-ink",
  live: "bg-turf animate-pulse",
  busted: "bg-danger",
  settled: "bg-ink/25",
};

export function GroupBettingClient({
  slug,
  league,
  week,
  members,
  initialSlips,
  initialGames,
  viewer,
}: {
  slug: string;
  league: League;
  week: NflWeek;
  members: LeagueMember[];
  initialSlips: ParlayWithLegs[];
  initialGames: NflGame[];
  viewer: { memberId: string; isAdmin: boolean };
}) {
  const { toast } = useToast();
  const [slips, setSlips] = useState(initialSlips);
  const [games, setGames] = useState(initialGames);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSlips[0]?.parlay.id ?? null,
  );
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [stakeDraft, setStakeDraft] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(true);

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

  // Realtime misses deletes and score changes, so keep a slow poll running.
  useEffect(() => {
    const id = window.setInterval(
      () => void refresh(),
      connected ? 90_000 : 30_000,
    );
    return () => window.clearInterval(id);
  }, [connected, refresh]);

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const selected =
    slips.find((s) => s.parlay.id === selectedId) ?? slips[0] ?? null;
  const legs = useMemo(() => selected?.legs ?? [], [selected]);

  const max = league.max_props_per_member;
  const stake = selected
    ? slipStake(selected.parlay, league)
    : calculateWeeklyStake(league);
  const estimate = slipEstimate(legs, stake);
  const phase: SlipPhase = selected
    ? slipPhase(selected.parlay, legs, gamesById)
    : "building";
  const capacity = Math.max(1, members.length) * max;
  const myLegs = legs.filter((l) => l.member_id === viewer.memberId).length;
  const picksLeft = Math.max(0, max - myLegs);
  const slipLocked = selected?.parlay.status === "locked";
  const canEditSlip =
    viewer.isAdmin || selected?.parlay.created_by_member_id === viewer.memberId;
  const showMoney = league.betting_mode !== "none";

  const byMember = useMemo(() => {
    const rows = members.map((m) => ({
      id: m.id,
      name: m.display_name,
      legs: legs.filter((l) => l.member_id === m.id),
    }));
    // Legs from someone who has since left still ride on the slip.
    const orphaned = legs.filter((l) => !members.some((m) => m.id === l.member_id));
    if (orphaned.length > 0) {
      rows.push({ id: "former", name: "Former members", legs: orphaned });
    }
    return rows;
  }, [members, legs]);
  const membersDone = byMember.filter((m) => m.id !== "former" && m.legs.length >= max).length;

  const upcoming = games.filter((g) => !gameStarted(g));
  const underway = games.filter((g) => gameStarted(g));

  async function createSlip(): Promise<string | null> {
    setCreating(true);
    try {
      const r = await api(`/api/leagues/${slug}/parlays`, {
        method: "POST",
        body: "{}",
      });
      if (!r.ok) {
        toast({ title: "Couldn't start a parlay", description: errorOf(r), tone: "error" });
        return null;
      }
      const id = (r.data.parlay as { id: string }).id;
      setSelectedId(id);
      await refresh();
      return id;
    } finally {
      setCreating(false);
    }
  }

  async function openGame(game: NflGame, refreshOdds = false) {
    if (!selected && !(await createSlip())) return;
    setPicker({ game, props: [], loading: true, note: null });
    const r = await api(
      `/api/leagues/${slug}/props?game=${game.id}${refreshOdds ? "&refresh=1" : ""}`,
    ).catch(() => null);
    // Ignore a response for a sheet the user already closed or switched.
    setPicker((cur) =>
      cur && cur.game.id === game.id
        ? {
            game,
            props: r?.ok ? (r.data.props as GameProp[]) : [],
            loading: false,
            note: r?.ok
              ? ((r.data.note as string | null) ?? null)
              : (r && errorOf(r)) ?? "Couldn't load odds",
          }
        : cur,
    );
  }

  async function addLeg(prop: GameProp) {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await api(
        `/api/leagues/${slug}/parlays/${selected.parlay.id}/legs`,
        { method: "POST", body: JSON.stringify({ game_prop_id: prop.id }) },
      );
      if (!r.ok) {
        toast({ title: "Not added", description: errorOf(r), tone: "error" });
        if (r.status === 404 && picker) void openGame(picker.game);
        return;
      }
      const left = picksLeft - 1;
      toast({
        title: `Added ${prop.player_name ?? prop.outcome_label}`,
        description: left > 0 ? `${left} pick${left === 1 ? "" : "s"} left` : "Your picks are in",
        tone: "success",
      });
      if (left <= 0) setPicker(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeLeg(legId: string) {
    if (!selected) return;
    const r = await api(
      `/api/leagues/${slug}/parlays/${selected.parlay.id}/legs/${legId}`,
      { method: "DELETE" },
    );
    if (!r.ok) {
      toast({ title: "Couldn't remove", description: errorOf(r), tone: "error" });
      return;
    }
    await refresh();
  }

  async function gradeLeg(legId: string, result: LegResult | "auto") {
    if (!selected) return;
    const r = await api(
      `/api/leagues/${slug}/parlays/${selected.parlay.id}/legs/${legId}`,
      { method: "PATCH", body: JSON.stringify({ result }) },
    );
    if (!r.ok) {
      toast({ title: "Couldn't grade", description: errorOf(r), tone: "error" });
      return;
    }
    await refresh();
  }

  async function patchSlip(body: Record<string, unknown>): Promise<boolean> {
    if (!selected) return false;
    const r = await api(`/api/leagues/${slug}/parlays/${selected.parlay.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      toast({ title: "Couldn't update the slip", description: errorOf(r), tone: "error" });
      return false;
    }
    await refresh();
    return true;
  }

  async function deleteSlip() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.parlay.title}" and all its picks?`)) return;
    const r = await api(`/api/leagues/${slug}/parlays/${selected.parlay.id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      toast({ title: "Couldn't delete", description: errorOf(r), tone: "error" });
      return;
    }
    setSelectedId(null);
    await refresh();
  }

  async function saveStake(e: FormEvent) {
    e.preventDefault();
    const raw = (stakeDraft ?? "").trim();
    const ok = await patchSlip({ stake: raw === "" ? null : Number(raw) });
    if (ok) setStakeDraft(null);
  }

  const heroActions = selected ? (
    <>
      {viewer.isAdmin && phase !== "settled" ? (
        <button
          type="button"
          className="rounded-md p-1.5 text-chalk/60 hover:bg-chalk/10 hover:text-chalk"
          aria-label={slipLocked ? "Unlock slip" : "Mark bet placed (locks the slip)"}
          title={slipLocked ? "Unlock slip" : "Mark bet placed"}
          onClick={() => void patchSlip({ status: slipLocked ? "open" : "locked" })}
        >
          {slipLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </button>
      ) : null}
      {canEditSlip ? (
        <button
          type="button"
          className="rounded-md p-1.5 text-chalk/60 hover:bg-chalk/10 hover:text-chalk"
          aria-label="Delete slip"
          title="Delete slip"
          onClick={() => void deleteSlip()}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </>
  ) : null;

  return (
    <div className="space-y-4">
      {slips.length > 0 ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {slips.map((s) => {
            const p = slipPhase(s.parlay, s.legs, gamesById);
            const isActive = s.parlay.id === selected?.parlay.id;
            return (
              <button
                key={s.parlay.id}
                type="button"
                onClick={() => setSelectedId(s.parlay.id)}
                className={cn(
                  "flex max-w-[12rem] shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition",
                  isActive
                    ? "bg-ink text-lime"
                    : "border border-border bg-chalk text-ink-muted hover:text-ink",
                )}
              >
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PHASE_DOT[p])} />
                <span className="truncate">{s.parlay.title}</span>
              </button>
            );
          })}
          <button
            type="button"
            disabled={creating}
            onClick={() => void createSlip()}
            className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border-strong px-3 py-1.5 text-xs font-bold text-ink-muted hover:text-ink disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> New slip
          </button>
        </div>
      ) : null}

      {selected ? (
        <SlipHero
          weekNumber={week.week}
          title={selected.parlay.title}
          phase={phase}
          legsIn={legs.length}
          capacity={capacity}
          american={estimate.american}
          stake={stake}
          payout={estimate.payout}
          showMoney={showMoney}
          currency={league.currency}
          onEditStake={
            canEditSlip && phase !== "settled"
              ? () => setStakeDraft(selected.parlay.stake != null ? String(selected.parlay.stake) : "")
              : undefined
          }
          actions={heroActions}
        >
          <FanduelLauncher legs={legs} />
        </SlipHero>
      ) : (
        <section className="relative overflow-hidden rounded-2xl bg-ink p-5 text-chalk shadow-card">
          <h2 className="font-display text-lg font-extrabold uppercase tracking-[0.12em] text-lime">
            Week {week.week} Parlay
          </h2>
          <p className="mt-2 text-sm text-chalk/70">
            Start the group&apos;s slip. Everyone adds up to {max} pick
            {max === 1 ? "" : "s"} from any game — TDs, yards, spreads, totals —
            then one tap opens it in FanDuel.
          </p>
          <button
            type="button"
            disabled={creating}
            onClick={() => void createSlip()}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime font-display text-sm font-extrabold uppercase tracking-wider text-ink transition active:scale-[0.98] disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {creating ? "Starting…" : "Start the parlay"}
          </button>
        </section>
      )}

      {selected ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-chalk shadow-card">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            onClick={() => setMembersOpen((v) => !v)}
            aria-expanded={membersOpen}
          >
            <div>
              <h2 className="font-display text-base font-bold uppercase tracking-wide text-ink">
                Member Picks
              </h2>
              <p className="text-xs text-ink-muted">
                {membersDone} of {members.length} done · {max} each
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 text-ink-faint transition-transform",
                membersOpen && "rotate-180",
              )}
            />
          </button>
          {membersOpen ? (
            <ul className="divide-y divide-border border-t border-border">
              {byMember.map((m) => {
                const isViewer = m.id === viewer.memberId;
                const done = m.legs.length >= max;
                return (
                  <li key={m.id} className={cn("px-4 py-2.5", isViewer && "bg-turf/5")}>
                    <div className="flex items-center gap-2.5 text-sm">
                      <span aria-hidden className="text-base leading-none">
                        {m.id === "former" ? "👋" : done ? "✅" : "⏳"}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                        {m.name}
                        {isViewer ? (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-turf">
                            You
                          </span>
                        ) : null}
                      </span>
                      {m.id !== "former" ? (
                        <span className="text-xs font-semibold text-ink-faint">
                          {m.legs.length === 0 ? "Needs picks" : `${m.legs.length}/${max}`}
                        </span>
                      ) : null}
                    </div>
                    {m.legs.length > 0 ? (
                      <ul className="pl-1">
                        {m.legs.map((leg) => {
                          const game = gamesById.get(leg.game_id);
                          const started = gameStarted(game);
                          const mine = leg.member_id === viewer.memberId;
                          const removable =
                            viewer.isAdmin ||
                            (mine && !started && !slipLocked && phase !== "settled");
                          return (
                            <LegRow
                              key={leg.id}
                              leg={leg}
                              game={game}
                              onRemove={removable ? () => void removeLeg(leg.id) : undefined}
                              onGrade={
                                viewer.isAdmin && started
                                  ? (result) => void gradeLeg(leg.id, result)
                                  : undefined
                              }
                            />
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-chalk shadow-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-ink">
              Add Picks
            </h2>
            <p className="text-xs text-ink-muted">
              {slipLocked
                ? "Slip is locked — the bet's placed."
                : picksLeft > 0
                  ? `Tap a game for every FanDuel prop · ${picksLeft} left`
                  : "Your picks are in — browse, or start another slip"}
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border border-t border-border">
          {[...upcoming, ...underway].map((game) => {
            const started = gameStarted(game);
            return (
              <li key={game.id}>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void openGame(game)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-field",
                    started && "opacity-60",
                  )}
                >
                  <span className="font-display text-sm font-bold uppercase tracking-wide text-ink">
                    {game.away_team} @ {game.home_team}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-ink-faint">
                    {gameStatusLabel(game)}
                    {game.status === "final" &&
                    game.home_score != null &&
                    game.away_score != null
                      ? ` ${game.away_score}-${game.home_score}`
                      : ""}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </li>
            );
          })}
          {games.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-ink-muted">
              This week&apos;s schedule isn&apos;t loaded yet.
            </li>
          ) : null}
        </ul>
      </section>

      <PropPickerSheet
        key={picker?.game.id ?? "closed"}
        game={picker?.game ?? null}
        props={picker?.props ?? []}
        loading={picker?.loading ?? false}
        note={picker?.note ?? null}
        picksLeft={picksLeft}
        slipLegs={legs}
        locked={slipLocked || phase === "settled"}
        busy={busy}
        onClose={() => setPicker(null)}
        onAdd={(prop) => void addLeg(prop)}
        onRefresh={
          viewer.isAdmin && picker ? () => void openGame(picker.game, true) : undefined
        }
      />

      <Sheet
        open={stakeDraft != null}
        onClose={() => setStakeDraft(null)}
        title="Stake"
        description={`Blank uses the league default (${formatMoney(calculateWeeklyStake(league), league.currency)}).`}
      >
        <form onSubmit={saveStake} className="space-y-3 pb-2">
          <input
            autoFocus
            inputMode="decimal"
            value={stakeDraft ?? ""}
            onChange={(e) => setStakeDraft(e.target.value)}
            placeholder={String(calculateWeeklyStake(league))}
            className="h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
          />
          <Button type="submit" fullWidth>
            Save stake
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
