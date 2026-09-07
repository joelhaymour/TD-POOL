import { createEspnNFLProvider } from "@/lib/providers/espn/espn-nfl-provider";
import { createMockNFLProvider } from "@/lib/providers/mock/mock-nfl-provider";
import { createMockOddsProvider } from "@/lib/providers/mock/mock-odds-provider";
import { createTheOddsApiProvider } from "@/lib/providers/the-odds-api/provider";
import type { NFLDataProvider, OddsProvider } from "@/lib/providers/types";

export type ProviderMode = "mock" | "live" | "auto";

export type OddsProviderContext = {
  roster?: Array<{
    external_player_id: string;
    name: string;
    team: string;
  }>;
  games?: Array<{
    external_game_id: string;
    home_team: string;
    away_team: string;
  }>;
};

function resolveProviderMode(): ProviderMode {
  const mode = process.env.PROVIDER_MODE?.toLowerCase();
  if (mode === "live" || mode === "auto" || mode === "mock") return mode;
  // Default: live when key present, otherwise mock
  return process.env.ODDS_API_KEY?.trim() ? "auto" : "mock";
}

function shouldUseEspnNFL(): boolean {
  const nfl = process.env.NFL_PROVIDER?.toLowerCase();
  if (nfl === "espn") return true;
  if (nfl === "mock") return false;
  const mode = resolveProviderMode();
  return mode === "live" || mode === "auto";
}

export function getConfiguredOddsSource(): "live" | "mock" {
  const mode = resolveProviderMode();
  const key = process.env.ODDS_API_KEY?.trim();
  if (mode === "mock") return "mock";
  if (mode === "live") return key ? "live" : "mock";
  return key ? "live" : "mock";
}

export function getNFLProvider(): NFLDataProvider {
  if (shouldUseEspnNFL()) {
    try {
      return createEspnNFLProvider();
    } catch {
      // Construction failure → mock so the app keeps running.
    }
  }
  return createMockNFLProvider();
}

/**
 * Odds provider: The Odds API when ODDS_API_KEY is set, otherwise mock.
 */
export function getOddsProvider(ctx: OddsProviderContext = {}): OddsProvider {
  const source = getConfiguredOddsSource();
  if (source === "live") {
    const apiKey = process.env.ODDS_API_KEY!.trim();
    return createTheOddsApiProvider({
      apiKey,
      regions: process.env.ODDS_API_REGIONS ?? "us",
      roster: ctx.roster,
      games: ctx.games,
    });
  }
  return createMockOddsProvider();
}

export { createEspnNFLProvider, matchPlayerExternalId } from "@/lib/providers/espn/espn-nfl-provider";
export { createMockNFLProvider, createMockOddsProvider };
export type * from "@/lib/providers/types";
