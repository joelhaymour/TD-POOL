"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useLeagueRealtime } from "@/hooks/use-league-realtime";
import { SlipHero } from "@/components/betting/slip-hero";
import { PropPickerSheet } from "@/components/betting/prop-picker-sheet";
import { LegRow } from "@/components/betting/leg-row";
import { LegProgress } from "@/components/betting/leg-progress";
import { MemberChip, ResultMark } from "@/components/ui/result-mark";
import { RideBet } from "@/components/betting/ride-bet";
import {
  gameStarted,
  slipEstimate,
  slipPhase,
  slipStake,
  type SlipPhase,
} from "@/lib/props/slip";
import { cn } from "@/lib/utils/cn";
import { calculateWeeklyStake, formatAmerican, formatMoney } from "@/lib/utils/odds";
import type {
  GameProp,
  League,
  LeagueMember,
  LegResult,
  NflGame,
  NflWeek,
  ParlayWithLegs,
} from "@/lib/types";

const GROUP_TABLES = ["parlays", "parlay_legs", "parlay_share_links"] as const;

type Picker = {
  game: NflGame;
  props: GameProp[];
  loading: boolean;
  note: string | null;
  /** Alternate lines and the long-tail markets are loaded. */
  extended: boolean;
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
  initialSlipId,
  viewer,
}: {
  slug: string;
  league: League;
  week: NflWeek;
  members: LeagueMember[];
  initialSlips: ParlayWithLegs[];
  initialGames: NflGame[];
  /** Parlay to open, when arriving from the Parlays tab. */
  initialSlipId?: string | null;
  viewer: { memberId: string; isAdmin: boolean };
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [slips, setSlips] = useState(initialSlips);
  const [games, setGames] = useState(initialGames);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSlipId ?? initialSlips[0]?.parlay.id ?? null,
  );
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [stakeDraft, setStakeDraft] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(true);
  const [sheet, setSheet] = useState<
    null | "switch" | "rename" | "delete" | "lock"
  >(null);
  const [nameDraft, setNameDraft] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await api(`/api/leagues/${slug}/parlays`);
      if (!r.ok) return;
      setSlips(r.data.slips as ParlayWithLegs[]);
      setGames(r.data.games as NflGame[]);
      // The league moved to a new week while this page was open: re-render
      // the server parts (header week, slip title) too.
      if (r.data.weekId && r.data.weekId !== week.id) router.refresh();
    } catch {
      // Keep the last good snapshot on a transient error.
    }
  }, [slug, week.id, router]);

  const { connected } = useLeagueRealtime(league.id, refresh, GROUP_TABLES);

  // Realtime misses deletes and score changes, so keep a poll running: every
  // 20s while a game is being played, lazily the rest of the week.
  const anyLive = games.some((g) => g.status === "in_progress");
  useEffect(() => {
    const every = anyLive ? 20_000 : connected ? 90_000 : 30_000;
    const id = window.setInterval(() => void refresh(), every);
    return () => window.clearInterval(id);
  }, [anyLive, connected, refresh]);

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const selected =
    slips.find((s) => s.parlay.id === selectedId) ?? slips[0] ?? null;
  const legs = useMemo(() => selected?.legs ?? [], [selected]);

  const oneEach = league.pick_mode === "one_each";
  const stake = selected
    ? slipStake(selected.parlay, league)
    : calculateWeeklyStake(league);
  const estimate = slipEstimate(legs, stake);
  const phase: SlipPhase = selected
    ? slipPhase(selected.parlay, legs, gamesById)
    : "building";
  const capacity = oneEach ? Math.max(1, members.length) : null;
  const myLegs = legs.filter((l) => l.member_id === viewer.memberId).length;
  /** Null means no limit — an open slip takes as many as anyone adds. */
  const picksLeft = oneEach ? Math.max(0, 1 - myLegs) : null;
  const canAddMore = picksLeft == null || picksLeft > 0;
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
  const membersDone = byMember.filter((m) => m.id !== "former" && m.legs.length >= 1).length;

  const upcoming = games.filter((g) => !gameStarted(g));
  const underway = games.filter((g) => gameStarted(g));

  /**
   * Nobody wants to name a slip before they can pick: "Week 2 parlay", then
   * "Week 2 parlay 2" if the group starts another. The pencil renames it.
   */
  function nextSlipTitle(): string {
    const base = `Week ${week.week} parlay`;
    const taken = new Set(slips.map((s) => s.parlay.title));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`)) n += 1;
    return `${base} ${n}`;
  }

  async function createSlip(title?: string): Promise<string | null> {
    setCreating(true);
    try {
      const r = await api(`/api/leagues/${slug}/parlays`, {
        method: "POST",
        body: JSON.stringify(title?.trim() ? { title: title.trim() } : {}),
      });
      if (!r.ok) {
        toast({ title: "Couldn't start a parlay", description: errorOf(r), tone: "error" });
        return null;
      }
      const id = (r.data.parlay as { id: string }).id;
      setSelectedId(id);
      setSheet(null);
      setNameDraft("");
      await refresh();
      return id;
    } finally {
      setCreating(false);
    }
  }

  async function openGame(
    game: NflGame,
    options: { refresh?: boolean; tier?: "core" | "extended" } = {},
  ) {
    if (!selected && !(await createSlip(nextSlipTitle()))) return;
    // Loading the extra markets keeps the board on screen underneath.
    setPicker((cur) => ({
      game,
      props: cur?.game.id === game.id ? cur.props : [],
      loading: true,
      note: null,
      extended: cur?.game.id === game.id ? cur.extended : false,
    }));

    const query = new URLSearchParams({ game: game.id });
    if (options.refresh) query.set("refresh", "1");
    if (options.tier === "extended") query.set("tier", "extended");
    const r = await api(`/api/leagues/${slug}/props?${query}`).catch(() => null);

    // Ignore a response for a sheet the user already closed or switched.
    setPicker((cur) =>
      cur && cur.game.id === game.id
        ? {
            game,
            props: r?.ok ? (r.data.props as GameProp[]) : cur.props,
            loading: false,
            extended: r?.ok ? Boolean(r.data.extended) : cur.extended,
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
      const lockedNow = Boolean(r.data.locked);
      toast({
        title: `Added ${prop.player_name ?? prop.outcome_label}`,
        description: lockedNow
          ? "That was the last pick — the bet is locked in"
          : oneEach
            ? "Your pick is in"
            : "Add more, or lock in the bet once it's placed",
        tone: "success",
      });
      if (oneEach) setPicker(null);
      await refresh();
      // The Create tab's badge is server-rendered; re-render it too.
      router.refresh();
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
    router.refresh();
  }

  async function addShareLink(url: string, note: string): Promise<boolean> {
    if (!selected) return false;
    const r = await api(`/api/leagues/${slug}/parlays/${selected.parlay.id}/shares`, {
      method: "POST",
      body: JSON.stringify({ url, note }),
    });
    if (!r.ok) {
      toast({ title: "Link not saved", description: errorOf(r), tone: "error" });
      return false;
    }
    toast({
      title: "Link shared",
      description: "The group can ride your bet now",
      tone: "success",
    });
    await refresh();
    return true;
  }

  async function removeShareLink(shareId: string) {
    if (!selected) return;
    const r = await api(
      `/api/leagues/${slug}/parlays/${selected.parlay.id}/shares/${shareId}`,
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

  // An in-app confirm, not window.confirm: webviews suppress the native
  // dialog, which silently returned false and made the button look dead.
  async function deleteSlip() {
    if (!selected) return;
    const r = await api(`/api/leagues/${slug}/parlays/${selected.parlay.id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      toast({ title: "Couldn't delete", description: errorOf(r), tone: "error" });
      return;
    }
    toast({ title: "Parlay deleted", tone: "success" });
    setSheet(null);
    setSelectedId(null);
    await refresh();
  }

  async function renameSlip(e: FormEvent) {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!name) return;
    if (await patchSlip({ title: name })) {
      setSheet(null);
      setNameDraft("");
    }
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
          className="rounded-md p-1.5 text-raised-fg/60 hover:bg-raised-fg/10 hover:text-raised-fg"
          aria-label={slipLocked ? "Unlock slip" : "Mark bet placed (locks the slip)"}
          title={slipLocked ? "Unlock slip" : "Mark bet placed"}
          onClick={() => void patchSlip({ status: slipLocked ? "open" : "locked" })}
        >
          {slipLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </button>
      ) : null}
      {canEditSlip && phase !== "settled" ? (
        <button
          type="button"
          className="rounded-md p-1.5 text-raised-fg/60 hover:bg-raised-fg/10 hover:text-raised-fg"
          aria-label="Rename parlay"
          title="Rename parlay"
          onClick={() => {
            setNameDraft(selected.parlay.title);
            setSheet("rename");
          }}
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : null}
      {canEditSlip ? (
        <button
          type="button"
          className="rounded-md p-1.5 text-raised-fg/60 hover:bg-raised-fg/10 hover:text-raised-fg"
          aria-label="Delete parlay"
          title="Delete parlay"
          onClick={() => setSheet("delete")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </>
  ) : null;

  return (
    <div className="space-y-4">
      {/* One line instead of a row of chips: a league can carry a lot of
          parlays, and picking from a list beats scrolling tiny pills. */}
      {slips.length > 0 ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-chalk px-3 py-2.5 text-left shadow-card"
            onClick={() => setSheet("switch")}
            aria-label="Switch parlay"
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", PHASE_DOT[phase])} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-sm font-bold uppercase tracking-wide text-ink">
                {selected?.parlay.title ?? "Pick a parlay"}
              </span>
              <span className="block text-[11px] text-ink-faint">
                {slips.length === 1
                  ? "Building this one"
                  : `${slips.length} parlays going · tap to switch`}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={() => void createSlip(nextSlipTitle())}
            className="flex h-[3.25rem] shrink-0 items-center gap-1 rounded-xl border border-dashed border-border-strong px-3 font-display text-xs font-bold uppercase tracking-wide text-ink-muted transition hover:text-ink disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> New
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
          progress={
            <LegProgress legs={legs} gamesById={gamesById} tone="dark" />
          }
        >
          {/* An open slip is locked in by whoever places the bet; a one-each
              slip locks itself, so it just says how close it is. */}
          {phase === "building" && !slipLocked ? (
            oneEach ? (
              <p className="text-xs font-medium text-raised-fg/60">
                Locks itself once everyone has picked · {membersDone} of{" "}
                {members.length} in
              </p>
            ) : legs.length > 0 ? (
              <button
                type="button"
                onClick={() => setSheet("lock")}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-lime pressable text-[15px] font-semibold text-accent-fg shadow-[0_6px_16px_-6px_rgba(17,128,60,0.55)]"
              >
                <Lock className="h-4 w-4" /> Lock in bet
              </button>
            ) : null
          ) : null}
          {legs.length > 0 || selected.shares.length > 0 ? (
            <RideBet
              shares={selected.shares}
              members={members}
              viewerMemberId={viewer.memberId}
              isAdmin={viewer.isAdmin}
              disabled={busy}
              onAdd={addShareLink}
              onRemove={removeShareLink}
            />
          ) : null}
        </SlipHero>
      ) : (
        <section className="relative overflow-hidden rounded-2xl bg-raised p-5 text-raised-fg shadow-card">
          <h2 className="font-display text-lg font-extrabold uppercase tracking-[0.12em] text-lime">
            Week {week.week} Parlay
          </h2>
          <p className="mt-2 text-sm text-raised-fg/70">
            Start the group&apos;s parlay.{" "}
            {oneEach
              ? "Everyone makes one pick from any game"
              : "Everyone adds as many picks as they like from any game"}{" "}
            — TDs, yards, spreads, totals. Whoever places it shares the link
            so the rest can ride it.
          </p>
          <button
            type="button"
            disabled={creating}
            onClick={() => void createSlip(nextSlipTitle())}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-lime pressable text-[15px] font-semibold text-accent-fg shadow-[0_6px_16px_-6px_rgba(17,128,60,0.55)] disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {creating ? "Starting…" : "Start a parlay"}
          </button>
        </section>
      )}

      {selected ? (
        <section className="overflow-hidden rounded-[1.4rem] bg-chalk shadow-card">
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
                {membersDone} of {members.length}{" "}
                {oneEach ? "picked · one each" : "in · no limit"}
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
                const done = m.legs.length >= 1;
                return (
                  <li key={m.id} className={cn("px-4 py-2.5", isViewer && "bg-turf/5")}>
                    <div className="flex items-center gap-2.5 text-sm">
                      <MemberChip name={m.name} />
                      {m.id !== "former" && done ? (
                        <ResultMark result="won" className="h-3.5 w-3.5" />
                      ) : null}
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
                          {m.legs.length === 0
                            ? oneEach
                              ? "Needs pick"
                              : "Nothing yet"
                            : oneEach
                              ? "Picked"
                              : `${m.legs.length} leg${m.legs.length === 1 ? "" : "s"}`}
                        </span>
                      ) : null}
                    </div>
                    {m.legs.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-2">
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
                              memberName={m.name}
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

      <section className="overflow-hidden rounded-[1.4rem] bg-chalk shadow-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-ink">
              Add Picks
            </h2>
            <p className="text-xs text-ink-muted">
              {slipLocked
                ? "Slip is locked — the bet's placed."
                : !canAddMore
                  ? "Your pick is in — it locks once everyone's picked"
                  : oneEach
                    ? "Tap a game and make your one pick"
                    : "Tap a game for every prop it lists · add as many as you like"}
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
        extendedLoaded={picker?.extended ?? false}
        onClose={() => setPicker(null)}
        onAdd={(prop) => void addLeg(prop)}
        onRefresh={
          viewer.isAdmin && picker
            ? () => void openGame(picker.game, { refresh: true })
            : undefined
        }
        onLoadExtended={() => {
          if (picker) void openGame(picker.game, { tier: "extended" });
        }}
      />

      <Sheet
        open={sheet === "switch"}
        onClose={() => setSheet(null)}
        title="Parlays going"
        description="Pick the one you're adding to."
      >
        <ul className="space-y-2 pb-2">
          {slips.map((s) => {
            const p = slipPhase(s.parlay, s.legs, gamesById);
            const est = slipEstimate(s.legs, slipStake(s.parlay, league));
            const isActive = s.parlay.id === selected?.parlay.id;
            return (
              <li key={s.parlay.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
                    isActive
                      ? "border-turf bg-turf/10"
                      : "border-border bg-field hover:border-turf",
                  )}
                  onClick={() => {
                    setSelectedId(s.parlay.id);
                    setSheet(null);
                  }}
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", PHASE_DOT[p])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {s.parlay.title}
                    </span>
                    <span className="block text-[11px] text-ink-faint">
                      {s.legs.length} leg{s.legs.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-sm font-bold text-turf">
                    {est.american != null ? formatAmerican(est.american) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      <Sheet
        open={sheet === "rename"}
        onClose={() => setSheet(null)}
        title="Rename parlay"
        description="Optional — everyone in the league sees this name."
      >
        <form className="space-y-3 pb-2" onSubmit={(e) => void renameSlip(e)}>
          <input
            autoFocus
            value={nameDraft}
            maxLength={60}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder={`Week ${week.week} parlay`}
            className="h-11 w-full rounded-xl border border-transparent bg-ink/[0.05] px-3 focus:bg-white text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
          />
          <Button type="submit" fullWidth disabled={!nameDraft.trim()}>
            Save name
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={sheet === "delete"}
        onClose={() => setSheet(null)}
        title="Delete this parlay?"
        description={
          selected
            ? `"${selected.parlay.title}" and its ${legs.length} pick${legs.length === 1 ? "" : "s"} go for everyone. This can't be undone.`
            : ""
        }
      >
        <div className="space-y-2 pb-2">
          <button
            type="button"
            className="h-12 w-full rounded-xl bg-danger font-display text-sm font-extrabold uppercase tracking-wider text-white transition active:scale-[0.98]"
            onClick={() => void deleteSlip()}
          >
            Delete parlay
          </button>
          <button
            type="button"
            className="h-11 w-full rounded-xl border border-border font-semibold text-ink"
            onClick={() => setSheet(null)}
          >
            Keep it
          </button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "lock"}
        onClose={() => setSheet(null)}
        title="Lock in this bet?"
        description="No more picks can be added once it's locked. An admin can unlock it if something's wrong."
      >
        <div className="space-y-2 pb-2">
          <button
            type="button"
            className="h-12 w-full rounded-full bg-lime pressable text-[15px] font-semibold text-accent-fg shadow-[0_6px_16px_-6px_rgba(17,128,60,0.55)]"
            onClick={() => {
              setSheet(null);
              void patchSlip({ status: "locked" });
            }}
          >
            Lock it in
          </button>
          <button
            type="button"
            className="h-11 w-full rounded-xl border border-border font-semibold text-ink"
            onClick={() => setSheet(null)}
          >
            Not yet
          </button>
        </div>
      </Sheet>

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
            className="h-11 w-full rounded-xl border border-transparent bg-ink/[0.05] px-3 focus:bg-white text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
          />
          <Button type="submit" fullWidth>
            Save stake
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
