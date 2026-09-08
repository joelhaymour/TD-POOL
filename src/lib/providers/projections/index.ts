/**
 * Optional FantasyPros-style projection signal.
 * Enabled when FANTASYPROS_API_KEY is set; otherwise returns null.
 * Kept optional so the core model never depends on it.
 */

export type WeeklyProjection = {
  externalPlayerId: string;
  playerName: string;
  /** Normalized 0–1 projection strength for anytime TD. */
  score: number;
  source: "fantasypros" | "none";
};

export function isProjectionProviderConfigured(): boolean {
  return Boolean(process.env.FANTASYPROS_API_KEY?.trim());
}

/**
 * Placeholder adapter — FantasyPros commercial API shapes vary by plan.
 * When unconfigured, returns an empty map (model skips projection factor).
 */
export async function getWeeklyTdProjectionScores(_args: {
  season: number;
  week: number;
  roster: Array<{ external_player_id: string; name: string }>;
}): Promise<Map<string, WeeklyProjection>> {
  if (!isProjectionProviderConfigured()) {
    return new Map();
  }
  // Commercial FantasyPros wiring requires a paid plan + endpoint mapping.
  // Architecture is ready; until configured, do not fabricate projections.
  return new Map();
}

export interface ProjectionProvider {
  getWeeklyPlayerProjection(args: {
    season: number;
    week: number;
    externalPlayerId: string;
  }): Promise<WeeklyProjection | null>;
}
