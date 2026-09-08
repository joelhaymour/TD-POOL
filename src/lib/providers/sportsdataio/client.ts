/**
 * Optional SportsDataIO NFL client.
 * Enabled when SPORTSDATAIO_API_KEY is set.
 * Docs: https://sportsdata.io/developers/api-documentation/nfl
 */

import { fetchWithTimeout } from "@/lib/concurrency";

const BASE = "https://api.sportsdata.io/v3/nfl";

export function isSportsDataIoConfigured(): boolean {
  return Boolean(process.env.SPORTSDATAIO_API_KEY?.trim());
}

async function sdioFetch<T>(path: string): Promise<T | null> {
  const key = process.env.SPORTSDATAIO_API_KEY?.trim();
  if (!key) return null;
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      timeoutMs: 12_000,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type SdioInjury = {
  PlayerID: number;
  Name?: string;
  Team?: string;
  Position?: string;
  Status?: string;
  InjuryStatus?: string;
  BodyPart?: string;
  DeclaredInactive?: boolean;
};

export type SdioDepthChart = {
  PlayerID: number;
  Name?: string;
  Team?: string;
  Position?: string;
  DepthOrder?: number;
};

export type SdioPlayerGameRedZone = {
  PlayerID: number;
  Name?: string;
  Team?: string;
  Week?: number;
  Season?: number;
  RushingAttempts?: number;
  ReceivingTargets?: number;
  RushingTouchdowns?: number;
  ReceivingTouchdowns?: number;
};

/** Season injuries by week (regular season). */
export async function fetchSdioInjuriesByWeek(
  season: number,
  week: number,
): Promise<SdioInjury[]> {
  const data = await sdioFetch<SdioInjury[]>(
    `/scores/json/Injuries/${season}/${week}`,
  );
  return Array.isArray(data) ? data : [];
}

export async function fetchSdioDepthChartsActive(): Promise<SdioDepthChart[]> {
  const data = await sdioFetch<SdioDepthChart[]>("/scores/json/DepthChartsActive");
  return Array.isArray(data) ? data : [];
}

export async function fetchSdioPlayerGameRedZone(
  season: number,
  week: number,
): Promise<SdioPlayerGameRedZone[]> {
  const data = await sdioFetch<SdioPlayerGameRedZone[]>(
    `/stats/json/PlayerGameRedZoneStats/${season}/${week}`,
  );
  return Array.isArray(data) ? data : [];
}
