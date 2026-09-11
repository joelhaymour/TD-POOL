"use client";

import { useCallback, useMemo, useState } from "react";
import { ExternalLink, Lock, Plus, RefreshCw, Trash2, Unlock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  PROP_GROUP_LABELS,
  PROP_GROUP_ORDER,
} from "@/lib/props/markets";
import { formatAmerican, tryCombineParlayDecimal, decimalToAmerican } from "@/lib/utils/odds";
import type {
  GameProp,
  League,
  LeagueMember,
  NflGame,
  NflWeek,
  ParlayWithLegs,
  PropMarketGroup,
} from "@/lib/types";

type PropsResponse = {
  game: NflGame;
  props: GameProp[];
  note: string | null;
};

function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function legLine(leg: {
  market_label: string;
  player_name: string | null;
  outcome_label: string;
  line: number | null;
}): string {
  const subject = leg.player_name ?? leg.outcome_label;
  const qualifier = leg.player_name
    ? leg.outcome_label === "Yes"
      ? ""
      : ` ${leg.outcome_label}`
    : "";
  const line = leg.line != null ? ` ${leg.line}` : "";
  return `${subject}${qualifier}${line} — ${leg.market_label}`;
}

export function GroupBettingClient({
  slug,
  league,
  week,
  games,
  members,
  initialParlays,
  viewer,
}: {
  slug: string;
  league: League;
  week: NflWeek;
  games: NflGame[];
  members: LeagueMember[];
  initialParlays: ParlayWithLegs[];
  viewer: { memberId: string; isAdmin: boolean };
}) {
  const { toast } = useToast();
  const [parlays, setParlays] = useState<ParlayWithLegs[]>(initialParlays);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // Prop picker sheet state
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<NflGame | null>(null);
  const [props, setProps] = useState<GameProp[]>([]);
  const [propsNote, setPropsNote] = useState<string | null>(null);
  const [loadingProps, setLoadingProps] = useState(false);
  const [group, setGroup] = useState<PropMarketGroup>("td_scorers");

  const memberName = useCallback(
    (id: string) =>
      members.find((m) => m.id === id)?.display_name ?? "Unknown",
    [members],
  );

  const refreshParlays = useCallback(async () => {
    const res = await fetch(`/api/leagues/${slug}/parlays`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { parlays: ParlayWithLegs[] };
      setParlays(data.parlays);
      return data.parlays;
    }
    return null;
  }, [slug]);

  async function createParlay() {
    setCreating(true);
    try {
      const res = await fetch(`/api/leagues/${slug}/parlays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({ title: "Could not create parlay", description: data.error, tone: "error" });
        return;
      }
      await refreshParlays();
      toast({ title: "Parlay started — add your picks", tone: "success" });
    } finally {
      setCreating(false);
    }
  }

  async function loadProps(game: NflGame, refresh = false) {
    setSelectedGame(game);
    setLoadingProps(true);
    setProps([]);
    setPropsNote(null);
    try {
      const res = await fetch(
        `/api/leagues/${slug}/props?game=${game.id}${refresh ? "&refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as PropsResponse & { error?: string };
      if (!res.ok) {
        setPropsNote(data.error ?? "Could not load odds");
        return;
      }
      setProps(data.props);
      setPropsNote(data.note);
    } catch {
      setPropsNote("Network error loading odds");
    } finally {
      setLoadingProps(false);
    }
  }

  async function addLeg(prop: GameProp) {
    if (!pickingFor) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/leagues/${slug}/parlays/${pickingFor}/legs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game_prop_id: prop.id }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({ title: "Not added", description: data.error, tone: "error" });
        return;
      }
      await refreshParlays();
      toast({
        title: `Added ${prop.player_name ?? prop.outcome_label}`,
        tone: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeLeg(parlayId: string, legId: string) {
    const res = await fetch(
      `/api/leagues/${slug}/parlays/${parlayId}/legs/${legId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      toast({ title: "Could not remove", description: data.error, tone: "error" });
      return;
    }
    await refreshParlays();
  }

  async function openInFanduel(parlayId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/leagues/${slug}/parlays/${parlayId}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        fanduel_url: string | null;
        unmatched_legs: string[];
        error?: string;
      };
      if (!res.ok) {
        toast({ title: "Could not build slip", description: data.error, tone: "error" });
        return;
      }
      if (!data.fanduel_url) {
        toast({
          title: "No FanDuel matches",
          description: "None of these picks are currently on FanDuel's board.",
          tone: "error",
        });
        return;
      }
      if (data.unmatched_legs.length > 0) {
        toast({
          title: `${data.unmatched_legs.length} pick(s) left off`,
          description: "FanDuel is not currently offering them — the rest are on the slip.",
        });
      }
      window.open(data.fanduel_url, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(parlayId: string, status: "open" | "locked") {
    const res = await fetch(`/api/leagues/${slug}/parlays/${parlayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await refreshParlays();
  }

  async function deleteParlay(parlayId: string) {
    const res = await fetch(`/api/leagues/${slug}/parlays/${parlayId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      toast({ title: "Could not delete", description: data.error, tone: "error" });
      return;
    }
    await refreshParlays();
  }

  const pickingParlay = useMemo(
    () => parlays.find((p) => p.parlay.id === pickingFor) ?? null,
    [parlays, pickingFor],
  );
  const myLegsUsed = pickingParlay
    ? pickingParlay.legs.filter((l) => l.member_id === viewer.memberId).length
    : 0;

  const groupedProps = useMemo(() => {
    const map = new Map<PropMarketGroup, Map<string, GameProp[]>>();
    for (const prop of props) {
      const groupMap = map.get(prop.market_group) ?? new Map<string, GameProp[]>();
      const list = groupMap.get(prop.market_label) ?? [];
      list.push(prop);
      groupMap.set(prop.market_label, list);
      map.set(prop.market_group, groupMap);
    }
    return map;
  }, [props]);

  const availableGroups = PROP_GROUP_ORDER.filter((g) => groupedProps.has(g));

  return (
    <div className="space-y-4 pb-24">
      <section className="rounded-2xl border border-border bg-ink p-4 text-chalk shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-widest text-lime">
              Week {week.week} group parlays
            </p>
            <p className="mt-1 text-sm text-chalk/70">
              Everyone adds up to {league.max_props_per_member} picks per slip.
              Open the finished slip in FanDuel to place it together.
            </p>
          </div>
        </div>
        <Button
          type="button"
          fullWidth
          className="mt-3"
          disabled={creating}
          onClick={() => void createParlay()}
        >
          <Plus className="mr-1 h-4 w-4" />
          {creating ? "Creating…" : "Create parlay"}
        </Button>
      </section>

      {parlays.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border-strong bg-chalk/60 p-6 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-ink">
            No parlays yet
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Start one and drop it in the group chat.
          </p>
        </section>
      ) : null}

      {parlays.map(({ parlay, legs }) => {
        const combined = tryCombineParlayDecimal(legs.map((l) => l.decimal_odds));
        const combinedAmerican = combined ? decimalToAmerican(combined) : null;
        const locked = parlay.status === "locked";
        const mine = legs.filter((l) => l.member_id === viewer.memberId).length;
        const canDelete = viewer.isAdmin || parlay.created_by_member_id === viewer.memberId;
        return (
          <section
            key={parlay.id}
            className="rounded-2xl border border-border bg-chalk/90 p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
                  {parlay.title}
                </h3>
                <p className="text-xs text-ink-faint">
                  {legs.length} leg{legs.length === 1 ? "" : "s"}
                  {combinedAmerican != null
                    ? ` · est. ${formatAmerican(combinedAmerican)}`
                    : ""}
                  {locked ? " · locked" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {viewer.isAdmin ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border p-2 text-ink-muted hover:text-ink"
                    title={locked ? "Unlock slip" : "Lock slip"}
                    onClick={() => void setStatus(parlay.id, locked ? "open" : "locked")}
                  >
                    {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border p-2 text-ink-muted hover:text-danger"
                    title="Delete slip"
                    onClick={() => void deleteParlay(parlay.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            {legs.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {legs.map((leg) => (
                  <li
                    key={leg.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-field px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {legLine(leg)}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">
                        {memberName(leg.member_id)} · {formatAmerican(leg.american_odds)}
                      </p>
                    </div>
                    {(leg.member_id === viewer.memberId || viewer.isAdmin) &&
                    !locked ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:text-danger"
                        title="Remove pick"
                        onClick={() => void removeLeg(parlay.id, leg.id)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                Empty slip — be the first to add a pick.
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={locked || mine >= league.max_props_per_member}
                onClick={() => {
                  setPickingFor(parlay.id);
                  setSelectedGame(null);
                  setProps([]);
                }}
              >
                {mine >= league.max_props_per_member
                  ? "Your picks are in"
                  : `Add picks (${mine}/${league.max_props_per_member})`}
              </Button>
              <Button
                type="button"
                disabled={legs.length === 0 || busy}
                onClick={() => void openInFanduel(parlay.id)}
              >
                <ExternalLink className="mr-1 h-4 w-4" />
                Open in FanDuel
              </Button>
            </div>
          </section>
        );
      })}

      <Sheet
        open={pickingFor != null}
        onClose={() => setPickingFor(null)}
        title={
          selectedGame
            ? `${selectedGame.away_team} @ ${selectedGame.home_team}`
            : "Pick a game"
        }
        description={
          pickingParlay
            ? `Your picks: ${myLegsUsed}/${league.max_props_per_member}`
            : undefined
        }
        className="max-h-[85vh]"
      >
        {!selectedGame ? (
          <ul className="space-y-2 overflow-y-auto pb-6">
            {games.map((game) => (
              <li key={game.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-field px-3 py-3 text-left hover:border-turf"
                  onClick={() => void loadProps(game)}
                >
                  <span className="font-display text-sm font-bold uppercase tracking-wide text-ink">
                    {game.away_team} @ {game.home_team}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {game.status === "final"
                      ? "Final"
                      : kickoffLabel(game.kickoff_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex max-h-[70vh] flex-col">
            <div className="flex items-center gap-2 pb-2">
              <button
                type="button"
                className="text-xs font-bold uppercase tracking-wider text-ink-faint hover:text-ink"
                onClick={() => setSelectedGame(null)}
              >
                ← All games
              </button>
              {viewer.isAdmin ? (
                <button
                  type="button"
                  className="ml-auto flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-faint hover:text-ink"
                  onClick={() => void loadProps(selectedGame, true)}
                >
                  <RefreshCw className="h-3 w-3" /> Refresh odds
                </button>
              ) : null}
            </div>

            {loadingProps ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                Loading FanDuel board…
              </p>
            ) : props.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                {propsNote ?? "No odds available for this game yet."}
              </p>
            ) : (
              <>
                <div className="flex gap-1 overflow-x-auto pb-2">
                  {availableGroups.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${
                        group === g
                          ? "bg-ink text-lime"
                          : "border border-border text-ink-muted"
                      }`}
                      onClick={() => setGroup(g)}
                    >
                      {PROP_GROUP_LABELS[g]}
                    </button>
                  ))}
                </div>
                {propsNote ? (
                  <p className="pb-2 text-xs text-ink-faint">{propsNote}</p>
                ) : null}
                <div className="flex-1 space-y-3 overflow-y-auto pb-6">
                  {[...(groupedProps.get(
                    availableGroups.includes(group) ? group : availableGroups[0]!,
                  ) ?? new Map<string, GameProp[]>())].map(
                    ([marketLabel, options]) => (
                      <div key={marketLabel}>
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-ink-faint">
                          {marketLabel}
                        </p>
                        <ul className="space-y-1">
                          {options.map((prop) => (
                            <li key={prop.id}>
                              <button
                                type="button"
                                disabled={
                                  busy ||
                                  myLegsUsed >= league.max_props_per_member
                                }
                                className="flex w-full items-center justify-between rounded-lg border border-border bg-field px-3 py-2 text-left hover:border-turf disabled:opacity-50"
                                onClick={() => void addLeg(prop)}
                              >
                                <span className="min-w-0 truncate text-sm font-semibold text-ink">
                                  {prop.player_name ?? prop.outcome_label}
                                  {prop.player_name &&
                                  prop.outcome_label !== "Yes"
                                    ? ` ${prop.outcome_label}`
                                    : ""}
                                  {prop.line != null ? ` ${prop.line}` : ""}
                                </span>
                                <span className="shrink-0 pl-2 font-display text-sm font-bold text-turf">
                                  {formatAmerican(prop.american_odds)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
