import { PROP_MARKETS, isAlternateMarket } from "@/lib/props/markets";
import { TEAM_ABBR_TO_FULL } from "@/lib/nfl/teams";
import type { NflGame } from "@/lib/types";

/**
 * How books phrase each market on a slip. The reader is handed this list so
 * it answers in our market keys instead of free text, and the hints cover the
 * wording that differs from our labels.
 */
const HINTS: Record<string, string> = {
  player_anytime_td: '"Anytime Touchdown Scorer", "To Score a Touchdown"',
  player_1st_td: '"First Touchdown Scorer"',
  player_last_td: '"Last Touchdown Scorer"',
  player_tds_over: '"To Score 2+ Touchdowns" is line 1.5 over',
  player_receptions: '"Over 4.5 Receptions", "Receptions O 4.5"',
  player_reception_yds: '"Over 59.5 Receiving Yards"',
  player_rush_yds: '"Over 74.5 Rushing Yards"',
  player_pass_yds: '"Over 249.5 Passing Yards"',
  player_pass_tds: '"Over 1.5 Passing Touchdowns"',
  player_rush_reception_yds: '"Over 89.5 Rush + Receiving Yards"',
  player_sacks: '"Over 0.5 Sacks"',
  h2h: '"Money Line", "To Win" — the team is the outcome',
  spreads: '"Bills -3.5", "Point Spread" — the team is the outcome, the number is the line',
  totals: '"Over 47.5 Total Points", "Total Points O 47.5"',
  team_totals: '"Bills Team Total Over 24.5" — the team goes in player_name',
};

export function marketCatalogueText(): string {
  return PROP_MARKETS.map((m) => {
    const ladder = isAlternateMarket(m.key)
      ? ' — "X+" / "X or more" ladders: line is X, outcome "over"'
      : "";
    const hint = HINTS[m.key] ? ` — ${HINTS[m.key]}` : "";
    return `- ${m.key} — ${m.label}${hint}${ladder}`;
  }).join("\n");
}

export function teamCatalogueText(): string {
  return Object.entries(TEAM_ABBR_TO_FULL)
    .map(([abbr, full]) => `${abbr} = ${full}`)
    .join(", ");
}

function fullName(abbr: string): string {
  return TEAM_ABBR_TO_FULL[abbr] ?? abbr;
}

/** "DET @ BUF — Detroit Lions at Buffalo Bills — Thu Sep 18, 8:15 PM ET". */
export function gameCatalogueText(games: NflGame[]): string {
  return games
    .map((g) => {
      const when = new Date(g.kickoff_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return `- ${g.id} | ${g.away_team} @ ${g.home_team} — ${fullName(g.away_team)} at ${fullName(g.home_team)} — ${when} ET`;
    })
    .join("\n");
}
