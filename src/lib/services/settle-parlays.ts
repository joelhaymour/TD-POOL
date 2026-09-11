import type { Store } from "@/lib/store/types";
import type { League, ParlayLeg } from "@/lib/types";
import { fetchEspnSummary } from "@/lib/providers/espn/espn-nfl-provider";
import { parseEspnBoxScore, type GameBoxScore } from "@/lib/props/box-score";
import { gradeLeg } from "@/lib/props/grade";
import { settleSlip, slipStake } from "@/lib/props/slip";

export type SettleSummary = { legsGraded: number; slipsSettled: number };

/**
 * Grade every pending leg whose game is final, then re-settle the league's
 * open slips. Canceled games void their legs. Box scores come from ESPN's
 * public summary endpoint — one request per final game that still has a
 * pending leg, so a fully graded league makes no requests at all.
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
  const games = await store.listGamesByIds([
    ...new Set(pending.map((l) => l.game_id)),
  ]);
  const gamesById = new Map(games.map((g) => [g.id, g]));

  const boxes = new Map<string, GameBoxScore>();
  await Promise.all(
    games
      .filter((g) => g.status === "final" && g.external_game_id)
      .map(async (g) => {
        const summary = await fetchEspnSummary(g.external_game_id!);
        const box = summary ? parseEspnBoxScore(summary) : null;
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
    const grade = box ? gradeLeg(leg, box) : null;
    if (grade) {
      grades.set(leg.id, { result: grade.result, actual_value: grade.actual });
    }
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
    const outcome = settleSlip(current, slipStake(parlay, league));
    const settledAt = outcome.settled ? (parlay.settled_at ?? gradedAt) : null;
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
