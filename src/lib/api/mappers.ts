import type { PlayerCardData } from "@/components/players/player-card";
import type { PlayerDetailData } from "@/components/players/player-detail";
import type { BetSlipLeg } from "@/components/picks/bet-slip";
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
    ourProbability: row.our_probability,
    marketProbability: row.market_probability,
    americanOdds: row.consensus_american_odds,
    matchupStars: row.matchup_rating,
    goalLineStars: row.goal_line_rating,
    availability,
    takenByName: row.taken_by,
    analysisHref: `/${slug}/players/${row.player.id}`,
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

  return {
    id: row.player.id,
    name: row.player.name,
    team: row.player.team,
    position: row.player.position,
    opponent,
    rank: row.td_pool_rank,
    ourProbability: row.our_probability,
    marketProbability: row.market_probability,
    americanOdds: row.consensus_american_odds,
    consensusOdds: row.consensus_american_odds,
    bookOdds: r.market.books.map((b) => ({
      book: b.sportsbook,
      americanOdds: b.american_odds,
    })),
    matchupStars: row.matchup_rating,
    goalLineStars: row.goal_line_rating,
    availability,
    injuryNote: r.injuries.player_detail,
    takenByName: row.taken_by,
    overview: {
      whyWeLike: r.why_we_like,
      concerns: r.concerns,
      verdict: r.verdict,
    },
    opportunity: [
      { label: "RZ carries", value: r.red_zone.carries },
      { label: "RZ targets", value: r.red_zone.targets },
      { label: "Touches/G", value: r.red_zone.touches_per_game },
      { label: "RZ share", value: `${Math.round(r.red_zone.share * 100)}%` },
      { label: "Inside 10", value: r.goal_line.carries_inside_10 },
      { label: "Inside 5", value: r.goal_line.carries_inside_5 },
      { label: "GL team share", value: `${Math.round(r.goal_line.team_share * 100)}%` },
    ],
    matchup: [
      { label: "Opponent", value: r.matchup.opponent },
      { label: "TDs allowed", value: r.matchup.tds_allowed },
      { label: "RZ TD rate", value: `${Math.round(r.matchup.red_zone_td_rate * 100)}%` },
      { label: "Rush TDs all.", value: r.matchup.rushing_tds_allowed },
      { label: "Rec TDs all.", value: r.matchup.receiving_tds_allowed },
      { label: "Pos rank all.", value: `#${r.matchup.position_rank_allowed}` },
    ],
    gameEnvironment: [
      { label: "Spread", value: r.game_environment.spread ?? "—" },
      { label: "Total", value: r.game_environment.total ?? "—" },
      {
        label: "Implied pts",
        value: r.game_environment.team_implied_points ?? "—",
      },
      {
        label: "Weather",
        value: r.game_environment.weather.notes || r.game_environment.weather.severity,
      },
    ],
    recentForm: [
      {
        label: "Snap share",
        value: `${Math.round(r.usage.snap_share * 100)}%`,
      },
      {
        label: "Carry share",
        value:
          r.usage.carry_share != null
            ? `${Math.round(r.usage.carry_share * 100)}%`
            : "—",
      },
      {
        label: "Target share",
        value:
          r.usage.target_share != null
            ? `${Math.round(r.usage.target_share * 100)}%`
            : "—",
      },
      { label: "Recent", value: r.usage.last_games_summary },
    ],
    recentTrend: r.usage.recent_trend,
    availabilityNotes: [
      r.injuries.player_detail,
      ...r.injuries.relevant.map(
        (x) => `${x.name}: ${x.status}${x.note ? ` — ${x.note}` : ""}`,
      ),
    ].filter((x): x is string => Boolean(x)),
    analysisNotes: [r.matchup.notes].filter(Boolean),
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
