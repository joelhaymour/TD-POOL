import { getStore } from "@/lib/store";
import type { Store } from "@/lib/store/types";
import type { League } from "@/lib/types";
import { gameStarted } from "@/lib/props/slip";
import { alignLeagueActiveWeek } from "@/lib/services/align-league-week";
import {
  AUTO_SYNC_TTL_MS,
  autoSyncLeagueWeek,
  syncNflWeek,
} from "@/lib/services/sync-nfl-week";
import { settleLeagueParlays } from "@/lib/services/settle-parlays";

/**
 * Background refresh for a group betting league: advance the week, pull live
 * scores, then grade legs on finished games. The TD board's odds sync is
 * skipped — group betting prices come from the per-game prop board instead.
 * Safe to call on every request; the shared slot allows one run a minute.
 */
export async function refreshGroupLeague(slug: string): Promise<void> {
  const store = getStore();
  try {
    if (!(await store.claimSyncSlot(`refresh:${slug}`, 60_000))) return;

    const league = await store.getLeagueBySlug(slug);
    if (!league) return;

    const week = await alignLeagueActiveWeek(store, league);
    await autoSyncLeagueWeek(slug, {
      target: { leagueId: league.id, week },
    }).catch(() => null);
    await syncOpenLegWeeks(store, league, week.id);
    await settleLeagueParlays(store, league);

    await store.completeSyncSlot(`refresh:${slug}`, "ok");
  } catch (err) {
    console.error("refreshGroupLeague failed", err);
    await store.completeSyncSlot(`refresh:${slug}`, "error").catch(() => {});
  }
}

/**
 * Scores sync for the active week only, but the league moves on at the last
 * kickoff — while Monday night is still being played. Keep any earlier week
 * with a pending leg on an unfinished game syncing, or that leg never grades.
 */
async function syncOpenLegWeeks(
  store: Store,
  league: League,
  activeWeekId: string,
): Promise<void> {
  const slips = (await store.listParlaysForLeague(league.id)).filter(
    (s) => !s.parlay.settled_at,
  );
  const gameIds = [
    ...new Set(
      slips.flatMap((s) =>
        s.legs.filter((l) => l.result === "pending").map((l) => l.game_id),
      ),
    ),
  ];
  if (gameIds.length === 0) return;

  const games = await store.listGamesByIds(gameIds);
  const weekIds = new Set(
    games
      .filter(
        (g) =>
          g.week_id !== activeWeekId &&
          gameStarted(g) &&
          g.status !== "final" &&
          g.status !== "canceled",
      )
      .map((g) => g.week_id),
  );
  if (weekIds.size === 0) return;

  const weeks = (await store.listWeeks()).filter((w) => weekIds.has(w.id));
  for (const w of weeks) {
    const key = `games:${league.slug}:${w.season}-${w.week}`;
    if (!(await store.claimSyncSlot(key, AUTO_SYNC_TTL_MS))) continue;
    try {
      const summary = await syncNflWeek(store, {
        season: w.season,
        week: w.week,
        scoresOnly: true,
      });
      await store.completeSyncSlot(key, "ok", {
        gamesUpdated: summary.gamesUpdated,
      });
    } catch (err) {
      console.error("open leg week sync failed", err);
      await store.completeSyncSlot(key, "error").catch(() => {});
    }
  }
}
