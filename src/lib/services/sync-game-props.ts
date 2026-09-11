import type { Store } from "@/lib/store/types";
import type { NflGame } from "@/lib/types";
import {
  fetchEventProps,
  findEventForGame,
} from "@/lib/providers/the-odds-api/props";
import { resolveRosterPlayer } from "@/lib/providers/the-odds-api/maps";

/**
 * Props refresh at most every 6 hours per game (shared across leagues via
 * sync_state), because a full FanDuel board costs ~14-16 credits per game.
 * Admins can force a refresh from the league page.
 */
export const PROPS_SYNC_TTL_MS = 6 * 60 * 60_000;

export type SyncGamePropsResult = {
  synced: boolean;
  propCount: number;
  creditsUsed: number;
  note: string | null;
};

export async function syncGameProps(
  store: Store,
  game: NflGame,
  options: { force?: boolean } = {},
): Promise<SyncGamePropsResult> {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) {
    return {
      synced: false,
      propCount: 0,
      creditsUsed: 0,
      note: "ODDS_API_KEY is not set — prop board unavailable",
    };
  }

  const key = `props:game:${game.id}`;
  const claimed = await store.claimSyncSlot(
    key,
    options.force ? 0 : PROPS_SYNC_TTL_MS,
  );
  if (!claimed) {
    return {
      synced: false,
      propCount: 0,
      creditsUsed: 0,
      note: "recently refreshed",
    };
  }

  try {
    const event = await findEventForGame(apiKey, game);
    if (!event) {
      await store.completeSyncSlot(key, "error", {
        note: "no matching Odds API event",
      });
      return {
        synced: false,
        propCount: 0,
        creditsUsed: 0,
        note: "Sportsbook has not listed this game",
      };
    }

    const { props, creditsUsed } = await fetchEventProps(apiKey, event.id);

    // Match player prop names to our roster so the board can show headshots
    // and positions. Unmatched names still land on the board as text.
    const players = await store.listPlayers();
    const roster = players.map((p) => ({
      external_player_id: p.id,
      name: p.name,
      team: p.team,
    }));
    const eventTeams = { home: game.home_team, away: game.away_team };

    const rows = props.map((prop) => ({
      market_key: prop.market_key,
      market_label: prop.market_label,
      market_group: prop.market_group,
      player_id: prop.player_name
        ? (resolveRosterPlayer(prop.player_name, roster, eventTeams)
            ?.external_player_id ?? null)
        : null,
      player_name: prop.player_name,
      outcome_label: prop.outcome_label,
      line: prop.line,
      american_odds: prop.american_odds,
      decimal_odds: prop.decimal_odds,
      fd_market_id: prop.fd_market_id,
      fd_selection_id: prop.fd_selection_id,
      deep_link: prop.deep_link,
    }));

    const count = await store.replaceGameProps(
      game.week_id,
      game.id,
      "fanduel",
      rows,
    );
    await store.completeSyncSlot(key, "ok", {
      props: count,
      credits: creditsUsed,
    });
    return { synced: true, propCount: count, creditsUsed, note: null };
  } catch (err) {
    await store.completeSyncSlot(key, "error", { message: String(err) });
    throw err;
  }
}
