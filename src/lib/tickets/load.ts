import type { Store } from "@/lib/store/types";
import { signTicketImages } from "@/lib/tickets/storage";
import { loadFollows } from "@/lib/social/follows";
import { EMPTY_REACTIONS, loadReactions } from "@/lib/social/reactions";
import type { League, NflGame, ParlayWithLegs } from "@/lib/types";

export type TicketSet = { tickets: ParlayWithLegs[]; games: NflGame[] };

/**
 * Every ticket the league has posted, with the games its legs sit on and a
 * fresh signed link to each screenshot. Screens filter from here: the feed
 * keeps what is still in play, History keeps what is settled.
 */
export async function loadTickets(
  store: Store,
  league: Pick<League, "id">,
  viewerMemberId: string | null = null,
): Promise<TicketSet> {
  const tickets = await store.listParlaysForLeague(league.id, "ticket");
  const games = await store.listGamesByIds([
    ...new Set(tickets.flatMap((t) => t.legs.map((l) => l.game_id))),
  ]);
  games.sort((a, b) => Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at));

  const ids = tickets.map((t) => t.parlay.id);
  const [signed, reactions, follows] = await Promise.all([
    signTicketImages(
      tickets
        .map((t) => t.parlay.screenshot_path)
        .filter((p): p is string => Boolean(p)),
    ),
    loadReactions("ticket", ids, viewerMemberId),
    loadFollows(ids, viewerMemberId),
  ]);
  return {
    tickets: tickets.map((t) => ({
      ...t,
      screenshot_url: t.parlay.screenshot_path
        ? (signed.get(t.parlay.screenshot_path) ?? null)
        : null,
      reactions: reactions.get(t.parlay.id) ?? EMPTY_REACTIONS,
      follow: follows.get(t.parlay.id) ?? { count: 0, mine: false },
    })),
    games,
  };
}

/**
 * What the feed shows: tickets still being played. A ticket moves to History
 * the moment every game on it is over (see settleLeagueParlays).
 */
export function feedTickets(tickets: ParlayWithLegs[]): ParlayWithLegs[] {
  return tickets.filter((t) => !t.parlay.settled_at);
}

/**
 * Games a screenshot could be about: this week's slate and next week's, since
 * a Thursday game is often bet the Tuesday before while the league is still
 * on the week that just ended.
 */
export async function candidateGames(
  store: Store,
  league: Pick<League, "active_week_id">,
): Promise<NflGame[]> {
  if (!league.active_week_id) return [];
  const weeks = await store.listWeeks();
  const active = weeks.find((w) => w.id === league.active_week_id);
  if (!active) return [];
  const next = weeks.find(
    (w) => w.season === active.season && w.week === active.week + 1,
  );
  const [thisWeek, nextWeek] = await Promise.all([
    store.listGamesForWeek(active.id),
    next ? store.listGamesForWeek(next.id) : Promise.resolve([]),
  ]);
  return [...thisWeek, ...nextWeek]
    .filter((g) => g.status !== "final" && g.status !== "canceled")
    .sort((a, b) => Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at));
}

/** A ticket is filed under the week of its earliest game. */
export function ticketWeekId(
  games: NflGame[],
  fallback: string,
): string {
  const first = [...games].sort(
    (a, b) => Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at),
  )[0];
  return first?.week_id ?? fallback;
}
