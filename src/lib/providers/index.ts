import { createMockNFLProvider } from "@/lib/providers/mock/mock-nfl-provider";
import { createMockOddsProvider } from "@/lib/providers/mock/mock-odds-provider";
import type { NFLDataProvider, OddsProvider } from "@/lib/providers/types";

export type ProviderMode = "mock" | "live";

function resolveProviderMode(): ProviderMode {
  const mode = process.env.PROVIDER_MODE?.toLowerCase();
  if (mode === "live") return "live";
  return "mock";
}

/**
 * Phase 1 always returns the mock NFL provider.
 * Live mode is stubbed for later phases.
 */
export function getNFLProvider(): NFLDataProvider {
  const mode = resolveProviderMode();
  if (mode === "live") {
    // Live NFL provider not wired yet — fall back to mock.
    return createMockNFLProvider();
  }
  return createMockNFLProvider();
}

/**
 * Phase 1 always returns the mock odds provider.
 * Live mode is stubbed for later phases.
 */
export function getOddsProvider(): OddsProvider {
  const mode = resolveProviderMode();
  if (mode === "live") {
    return createMockOddsProvider();
  }
  return createMockOddsProvider();
}

export { createMockNFLProvider, createMockOddsProvider };
export type * from "@/lib/providers/types";
