import type { PlayerCardData } from "@/components/players/player-card";
import type { PlayerDetailData } from "@/components/players/player-detail";
import type { BetSlipLeg } from "@/components/picks/bet-slip";
import { buildPlayerHistory } from "@/lib/providers/mock/mock-history";
import { displayOurProbability, hasMarketOdds } from "@/lib/scoring/rank";
import type { LeagueDashboard, MemberPickStatus } from "@/lib/types";

type RankedPlayer = LeagueDashboard["ranked_players"][number];

export function toPlayerCard(
  row: RankedPlayer,
  slug: string,
  picksLocked: boolean,
): PlayerCardData {
  const availability =
    picksLocked && row.availability === "available"
      ? ("locked" as const)
      : row.availability;
  const marketOk = hasMarketOdds(row);

  return {
    id: row.player.id,
    rank: row.td_pool_rank,
    name: row.player.name,
    team: row.player.team,
    position: row.player.position,
    opponent:
      row.game.home_team === row.player.team
        ? row.game.away_team
        : row.game.home_team,
    ourProbability: displayOurProbability(row),
    marketProbability: marketOk ? row.market_probability : null,
    americanOdds: marketOk ? row.consensus_american_odds : null,
    matchupStars: row.matchup_rating,
    goalLineStars: row.goal_line_rating,
    availability,
    takenByName: row.taken_by,
    analysisHref: `/${slug}/players/${row.player.id}`,
    limitedData: Boolean(row.research_json.td_model?.limited_data),
  };
}

export function toPlayerDetail(
  row: RankedPlayer,
  picksLocked: boolean,
): PlayerDetailData {
  const r = row.research_json;
  const opponent =
    row.game.home_team === row.player.team
      ? row.game.away_team
      : row.game.home_team;

  const availability =
    picksLocked && row.availability === "available"
      ? ("locked" as const)
      : row.availability;
  const marketOk = hasMarketOdds(row);
  const notes = r.matchup.notes || "";
  const dataLabelMatch = notes.match(/^(.*?)(?:\.|$)/);
  const opponentDataLabel = dataLabelMatch?.[1]?.trim() || "Opponent data";

  return {
    id: row.player.id,
    name: row.player.name,
    team: row.player.team,
    position: row.player.position,
    opponent,
    rank: row.td_pool_rank,
    ourProbability: displayOurProbability(row),
    marketProbability: marketOk ? row.market_probability : null,
    americanOdds: marketOk ? row.consensus_american_odds : null,
    consensusOdds: marketOk ? row.consensus_american_odds : null,
    bookOdds: r.market.books.map((b) => ({
      book: b.sportsbook,
      americanOdds: b.american_odds,
    })),
    matchupStars: row.matchup_rating,
    goalLineStars: row.goal_line_rating,
    availability,
    injuryNote: r.injuries.player_detail,
    takenByName: row.taken_by,
    limitedData: Boolean(r.td_model?.limited_data),
    overview: {
      whyWeLike: r.why_we_like,
      concerns: r.concerns,
      verdict: r.verdict,
    },
    history:
      r.history ??
      buildPlayerHistory({
        externalPlayerId: row.player.external_player_id ?? row.player.id,
        team: row.player.team,
        position: row.player.position,
        opponent,
        recentTrend: r.usage.recent_trend,
      }),
    matchup: [
      { label: "Opponent", value: r.matchup.opponent },
      {
        label: "Data source",
        value: opponentDataLabel,
      },
      {
        label: "RZ TD rate",
        value: `${Math.round(r.matchup.red_zone_td_rate * 100)}%`,
      },
      {
        label: "Rush TDs allowed",
        value: r.matchup.rushing_tds_allowed,
      },
      {
        label: "Rec TDs allowed",
        value: r.matchup.receiving_tds_allowed,
      },
      {
        label: `Pos TD rank vs ${row.player.position}`,
        value: `#${r.matchup.position_rank_allowed}`,
      },
      {
        label: "GL percentile",
        value:
          r.td_model?.goal_line_percentile != null
            ? `${Math.round(r.td_model.goal_line_percentile * 100)}th`
            : "—",
      },
      {
        label: "Matchup percentile",
        value:
          r.td_model?.matchup_percentile != null
            ? `${Math.round(r.td_model.matchup_percentile * 100)}th`
            : "—",
      },
    ],
    gameEnvironment: [
      { label: "Spread", value: r.game_environment.spread ?? "—" },
      { label: "Total", value: r.game_environment.total ?? "—" },
      {
        label: "Implied pts",
        value:
          r.game_environment.team_implied_points != null
            ? Number(r.game_environment.team_implied_points).toFixed(1)
            : "—",
      },
      {
        label: "Weather",
        value:
          r.game_environment.weather.notes?.toLowerCase().includes("indoor") ||
          r.game_environment.weather.severity === "none"
            ? r.game_environment.weather.notes || "Indoor / calm"
            : r.game_environment.weather.notes ||
              r.game_environment.weather.severity,
      },
    ],
    availabilityNotes: [
      r.injuries.player_detail,
      ...r.injuries.relevant.map(
        (x) => `${x.name}: ${x.status}${x.note ? ` — ${x.note}` : ""}`,
      ),
    ].filter((x): x is string => Boolean(x)),
    analysisNotes: [
      r.td_model
        ? `Model ${r.td_model.version} · completeness ${Math.round(r.td_model.data_completeness * 100)}%`
        : null,
      r.matchup.notes,
    ].filter((x): x is string => Boolean(x)),
  };
}

export function toBetSlipLegs(members: MemberPickStatus[]): BetSlipLeg[] {
  return members
    .filter((m) => m.pick && m.player)
    .map((m) => ({
      id: m.pick!.id,
      memberName: m.member.display_name,
      playerName: m.player!.name,
      team: m.player!.team,
      americanOdds:
        m.player_week?.consensus_american_odds ?? m.pick!.odds_at_selection,
    }));
}
