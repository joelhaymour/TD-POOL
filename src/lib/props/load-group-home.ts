import type { Store } from "@/lib/store/types";
import type { League, NflGame, ParlayWithLegs } from "@/lib/types";

/**
 * Slips that belong on Home: anything not yet settled. Empty slips from a
 * past week are dropped — nothing was ever bet, so there is nothing to show.
 * Games cover the active week plus any older game an open leg still sits on.
 */
export async function loadGroupHome(
  store: Store,
  league: League,
  weekId: string,
): Promise<{ slips: ParlayWithLegs[]; games: NflGame[] }> {
  const all = await store.listParlaysForLeague(league.id);
  const slips = all.filter(
    (s) =>
      !s.parlay.settled_at && (s.parlay.week_id === weekId || s.legs.length > 0),
  );

  const weekGames = await store.listGamesForWeek(weekId);
  const known = new Set(weekGames.map((g) => g.id));
  const extraIds = [
    ...new Set(slips.flatMap((s) => s.legs.map((l) => l.game_id))),
  ].filter((id) => !known.has(id));
  const extra = await store.listGamesByIds(extraIds);

  const games = [...weekGames, ...extra].sort(
    (a, b) => Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at),
  );
  return { slips, games };
}

/**
 * Parlays still waiting on this member's picks — the Create tab's badge.
 * A locked or settled slip wants nothing, and neither does one where they
 * have already used their allowance.
 */
export async function countParlaysNeedingPicks(
  store: Store,
  league: League,
  memberId: string,
): Promise<number> {
  const slips = await store.listParlaysForLeague(league.id);
  return slips.filter(
    (s) =>
      !s.parlay.settled_at &&
      s.parlay.status === "open" &&
      // Same slips Home shows: an empty one from a past week is not waiting
      // on anybody, and nobody can see it to act on the badge.
      (s.parlay.week_id === league.active_week_id || s.legs.length > 0) &&
      s.legs.filter((l) => l.member_id === memberId).length <
        league.max_props_per_member,
  ).length;
}
