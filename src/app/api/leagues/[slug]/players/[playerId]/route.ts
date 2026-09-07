import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { toPlayerDetail } from "@/lib/api/mappers";
import { parseSleeperExternalId } from "@/lib/providers/sleeper/client";
import { buildLivePlayerHistory } from "@/lib/providers/sleeper/research";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; playerId: string }> },
) {
  try {
    const { slug, playerId } = await context.params;
    const store = getStore();
    const dashboard = await store.getDashboard(slug);
    if (!dashboard) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const row = dashboard.ranked_players.find((p) => p.player.id === playerId);
    if (!row) {
      return NextResponse.json(
        { error: "Player not found for this week", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const sleeperId = parseSleeperExternalId(row.player.external_player_id);
    if (sleeperId) {
      const opponent =
        row.game.home_team === row.player.team
          ? row.game.away_team
          : row.game.home_team;
      try {
        const history = await buildLivePlayerHistory({
          sleeperPlayerId: sleeperId,
          team: row.player.team,
          opponent,
          beforeSeason: dashboard.week.season,
          beforeWeek: dashboard.week.week,
        });
        row.research_json = {
          ...row.research_json,
          history,
          usage: {
            ...row.research_json.usage,
            recent_trend: history.recent_trend,
            last_games_summary: history.last_5_summary,
          },
          matchup: {
            ...row.research_json.matchup,
            notes: history.vs_opponent_summary,
          },
        };
      } catch {
        // keep stored research
      }
    }

    return NextResponse.json({
      week: dashboard.week,
      picks_locked: dashboard.picks_locked,
      league: {
        id: dashboard.league.id,
        slug: dashboard.league.slug,
        name: dashboard.league.name,
        allow_pick_changes: dashboard.league.allow_pick_changes,
      },
      player: toPlayerDetail(row, dashboard.picks_locked),
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
