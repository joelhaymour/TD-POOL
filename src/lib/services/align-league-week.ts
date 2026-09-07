import { nextPoolWeek, resolvePoolWeek } from "@/lib/nfl/calendar";
import { ensureNflWeekMaterialized } from "@/lib/services/ensure-nfl-week";
import type { Store } from "@/lib/store/types";
import type { League, NflWeek } from "@/lib/types";

/**
 * Align a league onto the current pool week:
 * - Before season → Week 1
 * - After all games of active week are final → next week
 * - If active week is behind the calendar pool week → snap forward
 */
export async function alignLeagueActiveWeek(
  store: Store,
  league: League,
  asOf: Date = new Date(),
): Promise<NflWeek> {
  const pool = resolvePoolWeek(asOf);
  let targetSeason = pool.season;
  let targetWeek = pool.week;

  if (league.active_week_id) {
    const weeks = await store.listWeeks();
    const active = weeks.find((w) => w.id === league.active_week_id);
    if (active) {
      const games = await store.listGamesForWeek(active.id);
      const allFinal =
        games.length > 0 && games.every((g) => g.status === "final");

      const activeBehind =
        active.season < pool.season ||
        (active.season === pool.season && active.week < pool.week);

      if (allFinal) {
        const next = nextPoolWeek(active.season, active.week);
        if (next) {
          targetSeason = next.season;
          targetWeek = next.week;
        }
      } else if (activeBehind) {
        targetSeason = pool.season;
        targetWeek = pool.week;
      } else {
        targetSeason = active.season;
        targetWeek = active.week;
      }
    }
  }

  const week = await ensureNflWeekMaterialized(store, targetSeason, targetWeek);

  if (league.active_week_id !== week.id) {
    await store.updateLeagueSettings(league.id, { active_week_id: week.id });
  }

  return week;
}
