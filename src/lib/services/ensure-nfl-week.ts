import { weekWindow } from "@/lib/nfl/calendar";
import { getNFLProvider } from "@/lib/providers";
import {
  getSleeperPlayersMap,
  getSleeperSkillPlayers,
  parseSleeperExternalId,
} from "@/lib/providers/sleeper/client";
import {
  buildLivePlayerHistoryFromContext,
  buildResearchFromLive,
  prefetchHistoryContext,
  scoreTdPoolFromResearch,
} from "@/lib/providers/sleeper/research";
import { fetchGameWeather } from "@/lib/providers/weather/open-meteo";
import type { Store } from "@/lib/store/types";
import type { InjuryStatus, NflWeek } from "@/lib/types";

const materializeInFlight = new Map<string, Promise<NflWeek>>();
const materializeDoneAt = new Map<string, number>();
/** Bump when scoring rules change so boards rebuild. */
const BOARD_VERSION = "anytime-rush-rec-v2-replace";
const MATERIALIZE_TTL_MS = 10 * 60_000;

function mapInjury(raw: string | null | undefined): InjuryStatus {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "healthy";
  if (s.includes("ir") || s.includes("injured reserve")) return "injured_reserve";
  if (s.includes("out")) return "out";
  if (s.includes("doubt")) return "doubtful";
  if (s.includes("quest") || s.includes("pup")) return "questionable";
  return "healthy";
}

/**
 * Ensure schedule + skill-position board + live research exist for a season/week.
 * Uses ESPN (games) + Sleeper (roster/history) + Open-Meteo (weather).
 */
export async function ensureNflWeekMaterialized(
  store: Store,
  season: number,
  week: number,
  options: { force?: boolean } = {},
): Promise<NflWeek> {
  const key = `${BOARD_VERSION}:${season}-${week}`;
  const last = materializeDoneAt.get(key) ?? 0;
    if (!options.force && Date.now() - last < MATERIALIZE_TTL_MS) {
      const existing = await store.getWeekBySeasonWeek(season, week);
      if (existing) {
        const pwd = await store.getPlayerWeekData(existing.id);
        if (pwd.length > 0) {
          const players = await store.listPlayers();
          const byId = new Map(players.map((p) => [p.id, p]));
          const hasStaleQb = pwd.some((row) => {
            const p = byId.get(row.player_id);
            return p?.position === "QB" && row.td_pool_rank <= 10;
          });
          if (!hasStaleQb) return existing;
        }
      }
    }

  const inflight = materializeInFlight.get(key);
  if (inflight) return inflight;

  const run = (async () => {
    const window = weekWindow(season, week);
    const nflWeek = await store.ensureWeek({
      season,
      week,
      start_date: window.start_date,
      end_date: window.end_date,
      label: window.label,
    });

    const provider = getNFLProvider();
    const games = await provider.getWeekSchedule(season, week);
    if (!games.length) {
      materializeDoneAt.set(key, Date.now());
      return nflWeek;
    }

    const gameIdByExternal = await store.upsertGamesForWeek(nflWeek.id, games);
    const sleeperPlayers = await getSleeperSkillPlayers();
    const gamesByTeam = new Map<string, (typeof games)[number]>();
    for (const g of games) {
      gamesByTeam.set(g.home_team, g);
      gamesByTeam.set(g.away_team, g);
    }

    // Prefetch Sleeper history for RB/WR/TE research.
    const historyCtx = await prefetchHistoryContext({
      beforeSeason: season,
      beforeWeek: week,
    });

    const weekPlayers = sleeperPlayers.filter((p) => {
      if (!gamesByTeam.has(p.team)) return false;
      // Anytime TD = rush/receiving only — no QBs on this board.
      return p.position === "RB" || p.position === "WR" || p.position === "TE";
    });

    const playerIdByExternal = await store.upsertPlayers(weekPlayers);
    const sleeperMeta = await getSleeperPlayersMap();

    // Weather per game (bounded concurrency)
    const weatherByGame = new Map<string, Awaited<ReturnType<typeof fetchGameWeather>>>();
    {
      let cursor = 0;
      const workers = Array.from({ length: 4 }, async () => {
        while (cursor < games.length) {
          const i = cursor;
          cursor += 1;
          const g = games[i]!;
          const w = await fetchGameWeather({
            externalGameId: g.external_game_id,
            homeTeam: g.home_team,
            kickoffAt: g.kickoff_at,
            isDome: g.is_dome,
          });
          weatherByGame.set(g.external_game_id, w);
        }
      });
      await Promise.all(workers);
    }

    // Research per player (CPU-bound over cached stats)
    type BoardRow = Parameters<Store["replacePlayerWeekBoard"]>[1][number];
    const board: BoardRow[] = [];

    for (const player of weekPlayers) {
      const game = gamesByTeam.get(player.team);
      if (!game) continue;
      const gameId = gameIdByExternal.get(game.external_game_id);
      const playerId = playerIdByExternal.get(player.external_player_id);
      if (!gameId || !playerId) continue;

      const sleeperId = parseSleeperExternalId(player.external_player_id);
      if (!sleeperId) continue;

      const opponent =
        game.home_team === player.team ? game.away_team : game.home_team;
      const meta = sleeperMeta.get(sleeperId);
      const injuryStatus = mapInjury(meta?.injury_status ?? null);
      const weather =
        weatherByGame.get(game.external_game_id) ??
        (await fetchGameWeather({
          externalGameId: game.external_game_id,
          homeTeam: game.home_team,
          kickoffAt: game.kickoff_at,
          isDome: game.is_dome,
        }));

      const history = buildLivePlayerHistoryFromContext({
        sleeperPlayerId: sleeperId,
        team: player.team,
        opponent,
        ctx: historyCtx,
      });

      const research = buildResearchFromLive({
        playerName: player.name,
        team: player.team,
        position: player.position,
        opponent,
        game,
        history,
        weather,
        injuryStatus,
        injuryDetail: meta?.injury_status
          ? `${player.name}: ${meta.injury_status}`
          : null,
      });

      const scored = scoreTdPoolFromResearch(research);
      board.push({
        player_id: playerId,
        game_id: gameId,
        market_probability: scored.our_probability * 0.9,
        our_probability: scored.our_probability,
        td_pool_score: scored.score,
        td_pool_rank: 0,
        matchup_rating: scored.matchup_rating,
        goal_line_rating: scored.goal_line_rating,
        research_json: research,
        injury_status: injuryStatus,
        availability:
          injuryStatus === "out" || injuryStatus === "injured_reserve"
            ? "injured"
            : injuryStatus === "questionable" || injuryStatus === "doubtful"
              ? "questionable"
              : "available",
        tier: scored.tier,
        consensus_american_odds: 0,
        consensus_decimal_odds: 0,
      });
    }

    board.sort((a, b) => b.td_pool_score - a.td_pool_score);
    board.forEach((row, idx) => {
      row.td_pool_rank = idx + 1;
    });

    // Keep board size usable on mobile
    const trimmed = board.slice(0, 60);
    await store.replacePlayerWeekBoard(nflWeek.id, trimmed);

    materializeDoneAt.set(key, Date.now());
    return nflWeek;
  })().finally(() => {
    materializeInFlight.delete(key);
  });

  materializeInFlight.set(key, run);
  return run;
}
