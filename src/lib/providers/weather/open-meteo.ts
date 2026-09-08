/** Open-Meteo weather for NFL stadiums (no API key). */

import type { WeatherReport } from "@/lib/providers/types";
import { fetchWithTimeout } from "@/lib/concurrency";

/** Approximate stadium coordinates by home team abbreviation. */
const STADIUM_COORDS: Record<
  string,
  { lat: number; lon: number; name: string; dome?: boolean }
> = {
  ARI: { lat: 33.5276, lon: -112.2626, name: "State Farm Stadium", dome: true },
  ATL: { lat: 33.7554, lon: -84.4009, name: "Mercedes-Benz Stadium", dome: true },
  BAL: { lat: 39.278, lon: -76.6227, name: "M&T Bank Stadium" },
  BUF: { lat: 42.7738, lon: -78.787, name: "Highmark Stadium" },
  CAR: { lat: 35.2258, lon: -80.8528, name: "Bank of America Stadium" },
  CHI: { lat: 41.8623, lon: -87.6167, name: "Soldier Field" },
  CIN: { lat: 39.0955, lon: -84.5161, name: "Paycor Stadium" },
  CLE: { lat: 41.5061, lon: -81.6995, name: "Huntington Bank Field" },
  DAL: { lat: 32.7473, lon: -97.0945, name: "AT&T Stadium", dome: true },
  DEN: { lat: 39.7439, lon: -105.0201, name: "Empower Field" },
  DET: { lat: 42.34, lon: -83.0456, name: "Ford Field", dome: true },
  GB: { lat: 44.5013, lon: -88.0622, name: "Lambeau Field" },
  HOU: { lat: 29.6847, lon: -95.4107, name: "NRG Stadium", dome: true },
  IND: { lat: 39.7601, lon: -86.1639, name: "Lucas Oil Stadium", dome: true },
  JAX: { lat: 30.3239, lon: -81.6373, name: "EverBank Stadium" },
  KC: { lat: 39.0489, lon: -94.4839, name: "GEHA Field at Arrowhead" },
  LAC: { lat: 33.9535, lon: -118.339, name: "SoFi Stadium", dome: true },
  LAR: { lat: 33.9535, lon: -118.339, name: "SoFi Stadium", dome: true },
  LV: { lat: 36.0908, lon: -115.1836, name: "Allegiant Stadium", dome: true },
  MIA: { lat: 25.958, lon: -80.2389, name: "Hard Rock Stadium" },
  MIN: { lat: 44.9738, lon: -93.2577, name: "U.S. Bank Stadium", dome: true },
  NE: { lat: 42.0909, lon: -71.2643, name: "Gillette Stadium" },
  NO: { lat: 29.9511, lon: -90.0812, name: "Caesars Superdome", dome: true },
  NYG: { lat: 40.8128, lon: -74.0742, name: "MetLife Stadium" },
  NYJ: { lat: 40.8128, lon: -74.0742, name: "MetLife Stadium" },
  PHI: { lat: 39.9008, lon: -75.1675, name: "Lincoln Financial Field" },
  PIT: { lat: 40.4468, lon: -80.0158, name: "Acrisure Stadium" },
  SEA: { lat: 47.5952, lon: -122.3316, name: "Lumen Field" },
  SF: { lat: 37.4032, lon: -121.9698, name: "Levi's Stadium" },
  TB: { lat: 27.9759, lon: -82.5033, name: "Raymond James Stadium" },
  TEN: { lat: 36.1665, lon: -86.7713, name: "Nissan Stadium" },
  WAS: { lat: 38.9077, lon: -76.8645, name: "Northwest Stadium" },
};

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

function kmhToMph(kmh: number): number {
  return Math.round(kmh * 0.621371);
}

export async function fetchGameWeather(args: {
  externalGameId: string;
  homeTeam: string;
  kickoffAt: string;
  isDome: boolean;
}): Promise<WeatherReport> {
  const fetchedAt = new Date().toISOString();
  const stadium = STADIUM_COORDS[args.homeTeam];
  const isDome = args.isDome || Boolean(stadium?.dome);

  if (isDome || !stadium) {
    return {
      external_game_id: args.externalGameId,
      temperature_f: null,
      wind_mph: null,
      precip_chance: null,
      condition: isDome ? "Dome" : "Unknown",
      severity: "none",
      notes: isDome
        ? "Indoor stadium — weather neutralized."
        : "Weather unavailable for this venue.",
      is_dome: isDome,
      fetched_at: fetchedAt,
    };
  }

  try {
    const kickoff = new Date(args.kickoffAt);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(stadium.lat));
    url.searchParams.set("longitude", String(stadium.lon));
    url.searchParams.set(
      "hourly",
      "temperature_2m,precipitation_probability,windspeed_10m,weathercode",
    );
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("forecast_days", "16");

    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      timeoutMs: 10_000,
    });
    if (!res.ok) throw new Error("weather fetch failed");
    const json = (await res.json()) as {
      hourly?: {
        time: string[];
        temperature_2m: number[];
        precipitation_probability: number[];
        windspeed_10m: number[];
      };
    };

    const times = json.hourly?.time ?? [];
    let bestIdx = 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < times.length; i += 1) {
      const diff = Math.abs(new Date(times[i]!).getTime() - kickoff.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    const tempC = json.hourly?.temperature_2m?.[bestIdx] ?? null;
    const precip = json.hourly?.precipitation_probability?.[bestIdx] ?? null;
    const windKmh = json.hourly?.windspeed_10m?.[bestIdx] ?? null;
    const tempF = tempC == null ? null : cToF(tempC);
    const windMph = windKmh == null ? null : kmhToMph(windKmh);

    let severity: WeatherReport["severity"] = "none";
    if ((precip ?? 0) >= 60 || (windMph ?? 0) >= 20) severity = "moderate";
    if ((precip ?? 0) >= 80 || (windMph ?? 0) >= 28) severity = "severe";
    else if ((precip ?? 0) >= 35 || (windMph ?? 0) >= 15) severity = "mild";

    const bits: string[] = [];
    if (tempF != null) bits.push(`${tempF}°F`);
    if (windMph != null) bits.push(`wind ${windMph} mph`);
    if (precip != null) bits.push(`${precip}% precip`);
    bits.push(`@ ${stadium.name}`);

    return {
      external_game_id: args.externalGameId,
      temperature_f: tempF,
      wind_mph: windMph,
      precip_chance: precip,
      condition: severity === "none" ? "Clear/Fair" : "Impact weather",
      severity,
      notes: bits.join(" · "),
      is_dome: false,
      fetched_at: fetchedAt,
    };
  } catch {
    return {
      external_game_id: args.externalGameId,
      temperature_f: null,
      wind_mph: null,
      precip_chance: null,
      condition: "Unknown",
      severity: "none",
      notes: `Weather lookup failed for ${stadium.name}.`,
      is_dome: false,
      fetched_at: fetchedAt,
    };
  }
}
