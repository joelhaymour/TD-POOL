/**
 * Sleeper public NFL API (no key).
 * Players + weekly stats + schedule for historical research.
 */

import type { ProviderPlayer } from "@/lib/providers/types";

const SLEEPER_BASE = "https://api.sleeper.app";
const FETCH_TIMEOUT_MS = 20_000;

export type SleeperWeekStat = {
  player_id: string;
  team?: string;
  opponent?: string;
  gp?: number;
  rush_att?: number;
  rush_yd?: number;
  rush_td?: number;
  targets?: number;
  rec?: number;
  rec_yd?: number;
  rec_td?: number;
  pass_td?: number;
  rush_rz_att?: number;
  rec_rz_tgt?: number;
  off_snp?: number;
  tm_off_snp?: number;
  [key: string]: unknown;
};

export type SleeperScheduleGame = {
  status: string;
  date: string;
  home: string;
  away: string;
  week: number;
  game_id: string;
};

type SleeperPlayer = {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  team?: string | null;
  position?: string;
  status?: string;
  injury_status?: string | null;
  number?: number | null;
  active?: boolean;
};

const playersCache: { at: number; map: Map<string, SleeperPlayer> } = {
  at: 0,
  map: new Map(),
};
const weekStatCache = new Map<string, { at: number; stats: Map<string, SleeperWeekStat> }>();
const scheduleCache = new Map<string, { at: number; games: SleeperScheduleGame[] }>();

async function sleeperFetchJson<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SLEEPER_BASE}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function sleeperExternalId(playerId: string): string {
  return `sleeper-${playerId}`;
}

export function parseSleeperExternalId(externalId: string | null | undefined): string | null {
  if (!externalId?.startsWith("sleeper-")) return null;
  return externalId.slice("sleeper-".length);
}

export async function getSleeperPlayersMap(): Promise<Map<string, SleeperPlayer>> {
  const now = Date.now();
  if (playersCache.map.size > 0 && now - playersCache.at < 6 * 60 * 60_000) {
    return playersCache.map;
  }
  const raw = await sleeperFetchJson<Record<string, SleeperPlayer>>("/v1/players/nfl");
  const map = new Map<string, SleeperPlayer>();
  if (raw) {
    for (const [id, p] of Object.entries(raw)) {
      map.set(id, { ...p, player_id: p.player_id ?? id });
    }
  }
  playersCache.at = now;
  playersCache.map = map;
  return map;
}

export async function getSleeperSkillPlayers(): Promise<ProviderPlayer[]> {
  const map = await getSleeperPlayersMap();
  const out: ProviderPlayer[] = [];
  for (const [id, p] of map) {
    const pos = p.position;
    if (pos !== "RB" && pos !== "WR" && pos !== "TE" && pos !== "QB") continue;
    if (!p.team) continue;
    if (p.status && p.status !== "Active") continue;
    const name =
      p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      id;
    out.push({
      external_player_id: sleeperExternalId(id),
      name,
      team: p.team,
      position: pos,
      active: true,
      jersey_number: p.number ?? null,
      headshot_url: null,
    });
  }
  return out;
}

export async function getSleeperWeekStats(
  season: number,
  week: number,
): Promise<Map<string, SleeperWeekStat>> {
  const key = `${season}-${week}`;
  const cached = weekStatCache.get(key);
  if (cached && Date.now() - cached.at < 30 * 60_000) return cached.stats;

  const raw = await sleeperFetchJson<Record<string, SleeperWeekStat>>(
    `/v1/stats/nfl/regular/${season}/${week}`,
  );
  const stats = new Map<string, SleeperWeekStat>();
  if (raw) {
    for (const [id, row] of Object.entries(raw)) {
      stats.set(id, { ...row, player_id: id });
    }
  }
  weekStatCache.set(key, { at: Date.now(), stats });
  return stats;
}

export async function getSleeperSchedule(
  season: number,
): Promise<SleeperScheduleGame[]> {
  const cached = scheduleCache.get(String(season));
  if (cached && Date.now() - cached.at < 6 * 60 * 60_000) return cached.games;

  const raw = await sleeperFetchJson<SleeperScheduleGame[]>(
    `/schedule/nfl/regular/${season}`,
  );
  const games = Array.isArray(raw) ? raw : [];
  scheduleCache.set(String(season), { at: Date.now(), games });
  return games;
}

export function opponentFromSchedule(
  games: SleeperScheduleGame[],
  team: string,
  week: number,
): { opponent: string; home: boolean } | null {
  const g = games.find(
    (x) => x.week === week && (x.home === team || x.away === team),
  );
  if (!g) return null;
  const home = g.home === team;
  return { opponent: home ? g.away : g.home, home };
}

/** Anytime TD = rush TD + receiving TD only (never passing TDs). */
export function touchdownsFromStat(stat: SleeperWeekStat): number {
  return Number(stat.rush_td ?? 0) + Number(stat.rec_td ?? 0);
}

export function rzTouchesFromStat(stat: SleeperWeekStat): number {
  return Number(stat.rush_rz_att ?? 0) + Number(stat.rec_rz_tgt ?? 0);
}

/** Rushing attempts — used to keep designed-run QBs in the pool. */
export function rushAttemptsFromStat(stat: SleeperWeekStat): number {
  return Number(stat.rush_att ?? 0);
}
