import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { autoSyncLeagueWeek } from "@/lib/services/sync-nfl-week";
import {
  americanToDecimal,
  calculateWeeklyStake,
  combineParlayDecimal,
  decimalToAmerican,
  estimatePayout,
} from "@/lib/utils/odds";

function weekPhaseStatus(isActive: boolean): "active" | "complete" {
  return isActive ? "active" : "complete";
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/history">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    await autoSyncLeagueWeek(slug);
    const store = getStore();
    const league = await store.getLeagueBySlug(slug);
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const [members, weeks, players] = await Promise.all([
      store.listMembers(league.id),
      store.listWeeks(),
      store.listPlayers(),
    ]);

    const playersById = new Map(players.map((p) => [p.id, p]));
    const stake = calculateWeeklyStake(league);

    // Prefer weeks that have league picks, plus the active week always.
    const weekIdsWithPicks = new Set<string>();
    const picksByWeek = new Map<
      string,
      Awaited<ReturnType<typeof store.getPicksForWeek>>
    >();

    for (const week of weeks) {
      const picks = await store.getPicksForWeek(league.id, week.id);
      picksByWeek.set(week.id, picks);
      if (picks.length > 0) weekIdsWithPicks.add(week.id);
    }

    const relevantWeeks = weeks.filter(
      (w) =>
        weekIdsWithPicks.has(w.id) ||
        w.id === league.active_week_id ||
        weeks.length === 1,
    );

    const weekRows = await Promise.all(
      relevantWeeks.map(async (week) => {
        const picks = picksByWeek.get(week.id) ?? [];
        const playerWeek = await store.getPlayerWeekData(week.id);
        const pwdByPlayer = new Map(playerWeek.map((p) => [p.player_id, p]));

        const pickRows = picks.map((pick) => {
          const player = playersById.get(pick.player_id);
          const pwd = pwdByPlayer.get(pick.player_id);
          const member = members.find((m) => m.id === pick.member_id);
          return {
            memberId: pick.member_id,
            memberName: member?.display_name ?? "Unknown",
            playerId: pick.player_id,
            playerName: player?.name ?? "Unknown",
            team: player?.team ?? "—",
            result: pick.result,
            americanOdds:
              pwd?.consensus_american_odds ?? pick.odds_at_selection,
          };
        });

        const decimalLegs = picks.map((p) => {
          const pwd = pwdByPlayer.get(p.player_id);
          if (pwd) return pwd.consensus_decimal_odds;
          return americanToDecimal(p.odds_at_selection);
        });

        let parlay = {
          picks_submitted: picks.length,
          picks_total: members.length,
          stake,
          combined_decimal: null as number | null,
          combined_american: null as number | null,
          estimated_payout: null as number | null,
          estimated_profit: null as number | null,
          currency: league.currency,
          betting_mode: league.betting_mode,
        };

        if (decimalLegs.length > 0) {
          const combined = combineParlayDecimal(decimalLegs);
          parlay = {
            ...parlay,
            combined_decimal: Number(combined.toFixed(4)),
            combined_american: decimalToAmerican(combined),
          };
          if (league.betting_mode !== "none") {
            const { payout, profit } = estimatePayout(stake, combined);
            parlay.estimated_payout = Number(payout.toFixed(2));
            parlay.estimated_profit = Number(profit.toFixed(2));
          }
        }

        const isActive = week.id === league.active_week_id;
        const status = weekPhaseStatus(isActive);

        return {
          week,
          picks_submitted: picks.length,
          picks_total: members.length,
          parlay,
          picks: pickRows,
          status,
        };
      }),
    );

    // Newest week first
    weekRows.sort((a, b) => {
      if (a.week.season !== b.week.season) return b.week.season - a.week.season;
      return b.week.week - a.week.week;
    });

    return NextResponse.json({
      league: {
        id: league.id,
        slug: league.slug,
        name: league.name,
      },
      weeks: weekRows,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
