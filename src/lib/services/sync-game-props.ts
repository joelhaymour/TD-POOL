import type { Store } from "@/lib/store/types";
import type { NflGame } from "@/lib/types";
import { getConfiguredOddsSource } from "@/lib/providers";
import {
  fetchEventProps,
  findEventForGame,
} from "@/lib/providers/the-odds-api/props";
import { resolveRosterPlayer } from "@/lib/providers/the-odds-api/maps";
import {
  CORE_MARKET_KEYS,
  EXTENDED_MARKET_KEYS,
  isPlayerMarket,
} from "@/lib/props/markets";

/** Core markets load on open; the long tail loads when someone asks for it. */
export type PropTier = "core" | "extended";

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The Odds API bills per market a book prices, so the core board is ~12-16
 * credits per game and the extended pull is ~30-45 more. Boards are shared by
 * every league and refreshed at most once per TTL (PROPS_SYNC_TTL_HOURS,
 * default 6). Admins can force a refresh from the prop sheet.
 */
export const PROPS_SYNC_TTL_MS =
  envNumber("PROPS_SYNC_TTL_HOURS", 6) * 60 * 60_000;

/**
 * How often a board with game lines but no player markets checks again. The
 * check asks only for the missing player markets, which costs nothing while
 * FanDuel has none posted, so it can run far more often than a full refresh.
 */
export const PLAYER_PROPS_RECHECK_MS = 30 * 60_000;

/** Below this many credits, keep serving the saved board instead of refreshing. */
const CREDIT_FLOOR = envNumber("ODDS_CREDIT_FLOOR", 40);

export type SyncGamePropsResult = {
  synced: boolean;
  propCount: number;
  creditsUsed: number;
  /** User-facing reason a refresh did not happen; null when there is nothing to say. */
  note: string | null;
};

const skipped = (note: string | null): SyncGamePropsResult => ({
  synced: false,
  propCount: 0,
  creditsUsed: 0,
  note,
});

export async function syncGameProps(
  store: Store,
  game: NflGame,
  options: { force?: boolean; tier?: PropTier } = {},
): Promise<SyncGamePropsResult> {
  const tier = options.tier ?? "core";
  return pullMarkets(store, game, {
    key: tier === "core" ? `props:game:${game.id}` : `props:game:${game.id}:extended`,
    ttlMs: options.force ? 0 : PROPS_SYNC_TTL_MS,
    marketKeys: tier === "core" ? CORE_MARKET_KEYS : EXTENDED_MARKET_KEYS,
    emptyNote:
      tier === "extended"
        ? "FanDuel has no extra markets posted for this game yet"
        : "FanDuel has no props posted for this game yet",
  });
}

/**
 * Fill in player markets on a board that was pulled before FanDuel posted
 * them. Only player markets are requested and replaced, so the game lines
 * already on the board stay put, and the call is free until props appear.
 */
export async function recheckPlayerProps(
  store: Store,
  game: NflGame,
  options: { includeExtended: boolean },
): Promise<SyncGamePropsResult> {
  const keys = options.includeExtended
    ? [...CORE_MARKET_KEYS, ...EXTENDED_MARKET_KEYS]
    : CORE_MARKET_KEYS;
  return pullMarkets(store, game, {
    key: `props:game:${game.id}:players`,
    ttlMs: PLAYER_PROPS_RECHECK_MS,
    marketKeys: keys.filter(isPlayerMarket),
    emptyNote:
      "Game lines are up — FanDuel usually posts player props for this game midweek",
    // Nothing posted yet is the expected answer, not a failure to retry soon.
    emptyIsOk: true,
  });
}

async function pullMarkets(
  store: Store,
  game: NflGame,
  pull: {
    key: string;
    ttlMs: number;
    marketKeys: string[];
    emptyNote: string;
    emptyIsOk?: boolean;
  },
): Promise<SyncGamePropsResult> {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (getConfiguredOddsSource() !== "live" || !apiKey) {
    return skipped("Live odds are turned off in this environment");
  }

  const { key, marketKeys } = pull;
  const claimed = await store.claimSyncSlot(key, pull.ttlMs);
  if (!claimed) return skipped(null);

  try {
    const { event, creditsRemaining } = await findEventForGame(apiKey, game);
    if (creditsRemaining != null && creditsRemaining < CREDIT_FLOOR) {
      await store.completeSyncSlot(key, "error", { creditsRemaining });
      return skipped(
        `Only ${creditsRemaining} odds credits left this month — showing the last saved prices`,
      );
    }
    if (!event) {
      await store.completeSyncSlot(key, "error", {
        note: "no matching Odds API event",
      });
      return skipped("FanDuel has not listed this game yet");
    }

    const { props, creditsUsed } = await fetchEventProps(
      apiKey,
      event.id,
      marketKeys,
    );

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

    // An empty response (markets pulled) must not wipe a board people are
    // still reading from. Only this tier's markets are replaced.
    const count =
      rows.length > 0
        ? await store.replaceGameProps(
            game.week_id,
            game.id,
            "fanduel",
            rows,
            marketKeys,
          )
        : 0;
    await store.completeSyncSlot(
      key,
      count > 0 || pull.emptyIsOk ? "ok" : "error",
      { props: count, credits: creditsUsed },
    );
    return {
      synced: count > 0,
      propCount: count,
      creditsUsed,
      note: count > 0 ? null : pull.emptyNote,
    };
  } catch (err) {
    await store.completeSyncSlot(key, "error", { message: String(err) });
    throw err;
  }
}
