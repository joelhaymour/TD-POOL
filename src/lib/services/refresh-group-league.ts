import { getStore } from "@/lib/store";
import { alignLeagueActiveWeek } from "@/lib/services/align-league-week";
import { autoSyncLeagueWeek } from "@/lib/services/sync-nfl-week";
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

    await alignLeagueActiveWeek(store, league);
    await autoSyncLeagueWeek(slug).catch(() => null);
    await settleLeagueParlays(store, league);

    await store.completeSyncSlot(`refresh:${slug}`, "ok");
  } catch (err) {
    console.error("refreshGroupLeague failed", err);
    await store.completeSyncSlot(`refresh:${slug}`, "error").catch(() => {});
  }
}
