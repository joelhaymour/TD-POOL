import type { Store } from "@/lib/store/types";
import type { League, ParlayLeg } from "@/lib/types";
import { fetchEspnSummary } from "@/lib/providers/espn/espn-nfl-provider";
import { parseEspnBoxScore, type GameBoxScore } from "@/lib/props/box-score";
import { gradeLeg, gradeLegLive } from "@/lib/props/grade";
import { settleSlip, slipStake } from "@/lib/props/slip";
import type { NflGame } from "@/lib/types";

/** A game that will produce no more stats: over, or called off. */
export function gameDone(game: Pick<NflGame, "status"> | undefined): boolean {
  return game?.status === "final" || game?.status === "canceled";
}

export type SettleSummary = { legsGraded: number; slipsSettled: number };

/**
 * A live game's box score, shared by every league grading off it. Without
 * this, three leagues watching the same game each pull the same summary a
 * minute apart.
 */
const BOX_CACHE_MS = 45_000;
const boxCache = new Map<string, { at: number; box: GameBoxScore | null }>();

async function boxScoreFor(
  externalGameId: string,
  live: boolean,
): Promise<GameBoxScore | null> {
  const hit = boxCache.get(externalGameId);
  // A final game's box score never changes again, so it is cached for good.
  if (hit && (!live || Date.now() - hit.at < BOX_CACHE_MS)) return hit.box;
  const summary = await fetchEspnSummary(externalGameId);
  const box = summary ? parseEspnBoxScore(summary) : null;
  boxCache.set(externalGameId, { at: Date.now(), box });
  return box;
}

/**
 * Grade every pending leg on a game that is final OR under way, then
 * re-settle the league's open slips. A live game contributes the running
 * stat on each leg and calls anything already certain (see gradeLegLive), so
 * the parlay cards move during the game rather than at the final whistle.
 * Canceled games void their legs. Box scores come from ESPN's public summary
 * endpoint — one request per game that still has a pending leg, so a fully
 * graded league makes no requests at all.
 */
export async function settleLeagueParlays(
  store: Store,
  league: League,
): Promise<SettleSummary> {
  const slips = (await store.listParlaysForLeague(league.id)).filter(
    (s) => !s.parlay.settled_at,
  );
  if (slips.length === 0) return { legsGraded: 0, slipsSettled: 0 };

  const pending = slips.flatMap((s) =>
    s.legs.filter((l) => l.result === "pending"),
  );
  // Every leg's game, not just the open ones: a slip settles only once all
  // of its games are over, including games whose legs were called early.
  const games = await store.listGamesByIds([
    ...new Set(slips.flatMap((s) => s.legs.map((l) => l.game_id))),
  ]);
  const gamesById = new Map(games.map((g) => [g.id, g]));

  // Box scores only for games that still have a leg to grade.
  const openGameIds = new Set(pending.map((l) => l.game_id));
  const boxes = new Map<string, GameBoxScore>();
  await Promise.all(
    games
      .filter(
        (g) =>
          openGameIds.has(g.id) &&
          (g.status === "final" || g.status === "in_progress") &&
          g.external_game_id,
      )
      .map(async (g) => {
        const box = await boxScoreFor(
          g.external_game_id!,
          g.status !== "final",
        );
        if (box) boxes.set(g.id, box);
      }),
  );

  const gradedAt = new Date().toISOString();
  const grades = new Map<string, Pick<ParlayLeg, "result" | "actual_value">>();
  for (const leg of pending) {
    if (gamesById.get(leg.game_id)?.status === "canceled") {
      grades.set(leg.id, { result: "void", actual_value: null });
      continue;
    }
    const box = boxes.get(leg.game_id);
    if (!box) continue;
    const final = gamesById.get(leg.game_id)?.status === "final";
    const grade = final ? gradeLeg(leg, box) : gradeLegLive(leg, box);
    if (!grade) continue;
    // Live legs are re-read every cycle; only a change is worth a write, and
    // the realtime event every open app gets from it.
    if (grade.result === leg.result && grade.actual === leg.actual_value) {
      continue;
    }
    grades.set(leg.id, { result: grade.result, actual_value: grade.actual });
  }

  if (grades.size > 0) {
    await store.gradeParlayLegs(
      [...grades].map(([id, g]) => ({
        id,
        ...g,
        graded_at: gradedAt,
        manual_result: false,
      })),
    );
  }

  let slipsSettled = 0;
  for (const { parlay, legs } of slips) {
    const current = legs.map((l) => ({ ...l, ...grades.get(l.id) }));
    const outcome = settleSlip(
      current,
      slipStake(parlay, league),
      parlay.kind === "ticket" ? parlay.book_payout : null,
    );
    // A slip whose legs all cleared early is decided, but it stays in the
    // feed until its games actually end — there is still something to watch.
    // Once every game is over it moves to History; a busted slip goes even
    // if a leg could not be graded (it lost either way).
    const allDone = current.length > 0 && current.every((l) => gameDone(gamesById.get(l.game_id)));
    const decided = outcome.settled || outcome.result === "lost";
    const settledAt =
      decided && allDone ? (parlay.settled_at ?? gradedAt) : null;
    if (
      outcome.result === parlay.result &&
      outcome.payout === parlay.payout &&
      settledAt === parlay.settled_at
    ) {
      continue;
    }
    await store.updateParlay(parlay.id, {
      result: outcome.result,
      payout: outcome.payout,
      settled_at: settledAt,
    });
    if (settledAt) slipsSettled += 1;
  }

  return { legsGraded: grades.size, slipsSettled };
}
