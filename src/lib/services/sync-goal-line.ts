import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchSeasonGoalLine,
  loadSleeperGsisCrosswalk,
} from "@/lib/providers/nflverse/goal-line";
import { chunk } from "@/lib/concurrency";

/**
 * DynastyProcess is the only public link between Sleeper and GSIS ids, and it
 * is a single-maintainer repo. Snapshot every successful fetch so an outage
 * degrades to the last good copy — losing the crosswalk would silently drop
 * every measured goal-line number back to the old estimate.
 */
async function loadCrosswalkWithFallback(): Promise<Map<string, string>> {
  const db = createAdminClient();
  try {
    const fresh = await loadSleeperGsisCrosswalk();
    if (fresh.size < 1000) throw new Error(`crosswalk too small: ${fresh.size}`);

    const now = new Date().toISOString();
    const rows = [...fresh].map(([sleeper_id, gsis_id]) => ({
      sleeper_id,
      gsis_id,
      updated_at: now,
    }));
    for (const batch of chunk(rows, 1000)) {
      await db
        .from("player_id_crosswalk")
        .upsert(batch, { onConflict: "sleeper_id" });
    }
    return fresh;
  } catch {
    const { data } = await db
      .from("player_id_crosswalk")
      .select("sleeper_id, gsis_id");
    const cached = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.sleeper_id && row.gsis_id) cached.set(row.sleeper_id, row.gsis_id);
    }
    return cached;
  }
}

/** Per-player measured goal-line usage, keyed by Sleeper player id. */
export interface GoalLineUsage {
  gamesPlayed: number;
  inside5Carries: number;
  inside10Carries: number;
  inside5Targets: number;
  inside10Targets: number;
  endzoneTargets: number;
  inside5TeamShare: number | null;
}

export type GoalLineIndex = Map<string, GoalLineUsage>;

/**
 * Download a season of play-by-play and persist measured goal-line usage.
 * Returns null when the season has no published data yet.
 */
export async function syncSeasonGoalLine(
  season: number,
): Promise<{ season: number; weeks: number; players: number } | null> {
  const crosswalk = await loadCrosswalkWithFallback();
  const result = await fetchSeasonGoalLine(season, undefined, crosswalk);
  if (!result) return null;

  const db = createAdminClient();
  const now = new Date().toISOString();

  for (const batch of chunk(result.weeks, 500)) {
    const { error } = await db.from("nflverse_goal_line_week").upsert(
      batch.map((w) => ({
        season: w.season,
        week: w.week,
        season_type: w.seasonType,
        gsis_id: w.gsisId,
        sleeper_id: w.sleeperId,
        player_name: w.playerName,
        team: w.team,
        inside5_carries: w.inside5Carries,
        inside10_carries: w.inside10Carries,
        inside5_targets: w.inside5Targets,
        inside10_targets: w.inside10Targets,
        endzone_targets: w.endzoneTargets,
        rush_tds: w.rushTds,
        rec_tds: w.recTds,
        team_inside5_rushes: w.teamInside5Rushes,
        team_inside5_plays: w.teamInside5Plays,
        team_inside10_plays: w.teamInside10Plays,
        updated_at: now,
      })),
      { onConflict: "season,week,season_type,gsis_id" },
    );
    if (error) throw new Error(`goal-line week upsert: ${error.message}`);
  }

  for (const batch of chunk(result.seasons, 500)) {
    const { error } = await db.from("nflverse_goal_line_season").upsert(
      batch.map((s) => ({
        season: s.season,
        season_type: s.seasonType,
        gsis_id: s.gsisId,
        sleeper_id: s.sleeperId,
        player_name: s.playerName,
        team: s.team,
        games_played: s.gamesPlayed,
        inside5_carries: s.inside5Carries,
        inside10_carries: s.inside10Carries,
        inside5_targets: s.inside5Targets,
        inside10_targets: s.inside10Targets,
        endzone_targets: s.endzoneTargets,
        rush_tds: s.rushTds,
        rec_tds: s.recTds,
        team_inside5_rushes: s.teamInside5Rushes,
        team_inside5_plays: s.teamInside5Plays,
        inside5_team_share: s.inside5TeamShare,
        updated_at: now,
      })),
      { onConflict: "season,season_type,gsis_id" },
    );
    if (error) throw new Error(`goal-line season upsert: ${error.message}`);
  }

  return {
    season,
    weeks: result.weeks.length,
    players: result.seasons.length,
  };
}

/**
 * Read measured goal-line usage for the board. Falls back through prior seasons
 * so Week 1 — when the current season has no plays yet — still gets real data.
 */
export async function loadGoalLineIndex(
  seasons: number[],
): Promise<{ index: GoalLineIndex; season: number | null }> {
  const db = createAdminClient();
  for (const season of seasons) {
    const { data, error } = await db
      .from("nflverse_goal_line_season")
      .select(
        "sleeper_id, games_played, inside5_carries, inside10_carries, inside5_targets, inside10_targets, endzone_targets, inside5_team_share",
      )
      .eq("season", season)
      .not("sleeper_id", "is", null);
    if (error || !data?.length) continue;

    const index: GoalLineIndex = new Map();
    for (const row of data) {
      if (!row.sleeper_id) continue;
      index.set(row.sleeper_id, {
        gamesPlayed: row.games_played ?? 0,
        inside5Carries: row.inside5_carries ?? 0,
        inside10Carries: row.inside10_carries ?? 0,
        inside5Targets: row.inside5_targets ?? 0,
        inside10Targets: row.inside10_targets ?? 0,
        endzoneTargets: row.endzone_targets ?? 0,
        inside5TeamShare: row.inside5_team_share ?? null,
      });
    }
    if (index.size) return { index, season };
  }
  return { index: new Map(), season: null };
}
