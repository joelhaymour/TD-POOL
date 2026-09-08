import { weekWindow } from "@/lib/nfl/calendar";
import { getNFLProvider } from "@/lib/providers";
import {
  getSleeperPlayersMap,
  getSleeperSkillPlayers,
  parseSleeperExternalId,
} from "@/lib/providers/sleeper/client";
import {
  buildLivePlayerHistoryFromContext,
  prefetchHistoryContext,
} from "@/lib/providers/sleeper/research";
import { collectNflverseVsOpponent } from "@/lib/providers/nflverse/vs-opponent";
import { loadCrosswalkWithFallback } from "@/lib/services/sync-goal-line";
import { fetchGameWeather } from "@/lib/providers/weather/open-meteo";
import {
  fetchSdioDepthChartsActive,
  fetchSdioInjuriesByWeek,
  isSportsDataIoConfigured,
} from "@/lib/providers/sportsdataio/client";
import {
  loadDefenseProfiles,
  rankTeamsByTdAllowed,
} from "@/lib/providers/team-defense/from-sleeper";
import { getWeeklyTdProjectionScores } from "@/lib/providers/projections";
import { mapWithConcurrency } from "@/lib/concurrency";
import { loadGoalLineIndex } from "@/lib/services/sync-goal-line";
import {
  buildPlayerWeekFeatures,
  collectPlayerSeasonStats,
  featuresToResearchJson,
  type FeatureBuildContext,
} from "@/lib/model/build-features";
import { computeTdPoolFromFeatures } from "@/lib/model/compute-td-pool";
import { buildDeterministicAnalysis } from "@/lib/model/explain";
import { attachModelMeta } from "@/lib/model/recompute-with-market";
import { TD_POOL_MODEL_VERSION } from "@/lib/model/version";
import type { Store } from "@/lib/store/types";
import type { InjuryStatus, NflWeek } from "@/lib/types";

/** Dedupes concurrent calls inside one instance; DB state dedupes across them. */
const materializeInFlight = new Map<string, Promise<NflWeek>>();
/** Bump when scoring / feature pipeline changes so boards rebuild. */
const BOARD_VERSION = `td-engine-${TD_POOL_MODEL_VERSION}-no-ai-board`;
/** How long a persisted board is trusted before a rebuild is allowed. */
export const MATERIALIZE_TTL_MS = 6 * 60 * 60_000;
/** A board smaller than this means the build was truncated or failed. */
const MIN_HEALTHY_BOARD = 120;

/**
 * Is the board already in Supabase good enough to serve?
 * This is checked before any provider work so a cold serverless instance
 * reuses the stored board instead of rebuilding it.
 */
export async function readBoardHealth(
  store: Store,
  season: number,
  week: number,
): Promise<{ week: NflWeek | null; healthy: boolean; rows: number }> {
  const existing = await store.getWeekBySeasonWeek(season, week);
  if (!existing) return { week: null, healthy: false, rows: 0 };

  const rows = await store.countPlayerWeekRows(existing.id);
  if (rows < MIN_HEALTHY_BOARD) return { week: existing, healthy: false, rows };

  // The sync key embeds BOARD_VERSION, so a successful record for this key
  // means the stored rows were produced by the engine we are running now.
  const state = await store.getSyncState(materializeKey(season, week));
  const healthy =
    state?.status === "ok" && Number(state.detail.players ?? 0) === rows;

  return { week: existing, healthy, rows };
}

function materializeKey(season: number, week: number): string {
  return `materialize:${BOARD_VERSION}:${season}-${week}`;
}

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
 * Ensure schedule + skill-position board + TD Pool engine exist for a season/week.
 * Providers: ESPN schedule, Sleeper usage/history, Open-Meteo weather,
 * optional SportsDataIO depth/injuries, The Odds API (separate sync).
 */
export async function ensureNflWeekMaterialized(
  store: Store,
  season: number,
  week: number,
  options: { force?: boolean } = {},
): Promise<NflWeek> {
  const key = `${BOARD_VERSION}:${season}-${week}`;
  const syncKey = materializeKey(season, week);

  // 1) Trust the database first. A persisted, current-version board is served
  //    as-is, which is what makes cold starts cheap.
  if (!options.force) {
    const health = await readBoardHealth(store, season, week);
    if (health.week && health.healthy) return health.week;
  }

  const inflight = materializeInFlight.get(key);
  if (inflight) return inflight;

  // 2) Only one instance may rebuild within the TTL. Losers serve whatever the
  //    database currently holds rather than duplicating provider work.
  const claimed = await store.claimSyncSlot(
    syncKey,
    options.force ? 60_000 : MATERIALIZE_TTL_MS,
  );
  if (!claimed) {
    const existing = await store.getWeekBySeasonWeek(season, week);
    if (existing) return existing;
  }

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
      await store.completeSyncSlot(syncKey, "error", {
        message: "Schedule provider returned no games",
      });
      return nflWeek;
    }

    const gameIdByExternal = await store.upsertGamesForWeek(nflWeek.id, games);
    const sleeperPlayers = await getSleeperSkillPlayers();
    const gamesByTeam = new Map<string, (typeof games)[number]>();
    for (const g of games) {
      gamesByTeam.set(g.home_team, g);
      gamesByTeam.set(g.away_team, g);
    }

    const historyCtx = await prefetchHistoryContext({
      beforeSeason: season,
      beforeWeek: week,
    });

    // Also pull prior-season weeks for early-season blending when needed.
    const priorCtx =
      week <= 5
        ? await prefetchHistoryContext({
            beforeSeason: season - 1,
            beforeWeek: 19,
          })
        : null;

    // QBs are included: anytime TD counts rushing scores, and designed-run
    // quarterbacks are among the shortest prices in the league every week.
    // Passing TDs never enter the model (see touchdownsFromStat).
    const weekPlayers = sleeperPlayers.filter((p) => {
      if (!gamesByTeam.has(p.team)) return false;
      return (
        p.position === "RB" ||
        p.position === "WR" ||
        p.position === "TE" ||
        p.position === "QB"
      );
    });

    const playerIdByExternal = await store.upsertPlayers(weekPlayers);
    const sleeperMeta = await getSleeperPlayersMap();

    // Career H2H: nflverse weekly box scores back to 2014, up to 5 meetings.
    // The two-season Sleeper window only catches 0–2 games and the old deep
    // scan died on a 90s budget before it reached a player's previous team.
    const crosswalk = await loadCrosswalkWithFallback();
    historyCtx.deepVsOpponent = await collectNflverseVsOpponent({
      targets: weekPlayers.flatMap((p) => {
        const sleeperId = parseSleeperExternalId(p.external_player_id);
        const game = gamesByTeam.get(p.team);
        if (!sleeperId || !game) return [];
        const opponent =
          game.home_team === p.team ? game.away_team : game.home_team;
        return [{ sleeperId, opponent }];
      }),
      crosswalk,
      beforeSeason: season,
      beforeWeek: week,
    });

    const { profiles: defense, label: defenseLabel } = await loadDefenseProfiles({
      season,
      week,
    });
    const rushTdRanks = rankTeamsByTdAllowed(defense, "rush");
    const recTdRanks = rankTeamsByTdAllowed(defense, "rec");

    const depthBySleeperId = new Map<string, number>();
    const teammateOutByTeam = new Map<string, string[]>();

    if (isSportsDataIoConfigured()) {
      const [depth, injuries] = await Promise.all([
        fetchSdioDepthChartsActive(),
        fetchSdioInjuriesByWeek(season, week),
      ]);
      // Depth charts use SportsDataIO player IDs — map by name+team soft key.
      const byNameTeam = new Map<string, string>();
      for (const [id, p] of sleeperMeta) {
        const name = (p.full_name || "").toLowerCase();
        const team = (p.team || "").toUpperCase();
        if (name && team) byNameTeam.set(`${name}|${team}`, id);
      }
      for (const row of depth) {
        const name = (row.Name || "").toLowerCase();
        const team = (row.Team || "").toUpperCase();
        const sid = byNameTeam.get(`${name}|${team}`);
        if (sid && row.DepthOrder != null) depthBySleeperId.set(sid, row.DepthOrder);
      }
      for (const inj of injuries) {
        const status = (inj.InjuryStatus || inj.Status || "").toLowerCase();
        if (!status.includes("out") && !status.includes("doubt")) continue;
        const team = (inj.Team || "").toUpperCase();
        if (!team) continue;
        const list = teammateOutByTeam.get(team) ?? [];
        list.push(`${inj.Name ?? "Teammate"} (${inj.InjuryStatus || inj.Status})`);
        teammateOutByTeam.set(team, list);
      }
    } else {
      // Depth proxy from Sleeper injury tags on teammates.
      for (const [id, p] of sleeperMeta) {
        if (!p.team) continue;
        const status = mapInjury(p.injury_status);
        if (status === "out" || status === "injured_reserve" || status === "doubtful") {
          const list = teammateOutByTeam.get(p.team) ?? [];
          list.push(
            `${p.full_name ?? id}: ${p.injury_status ?? status}`,
          );
          teammateOutByTeam.set(p.team, list);
        }
      }
    }

    const projections = await getWeeklyTdProjectionScores({
      season,
      week,
      roster: weekPlayers.map((p) => ({
        external_player_id: p.external_player_id,
        name: p.name,
      })),
    });
    const projectionScores = new Map<string, number>();
    for (const [id, row] of projections) projectionScores.set(id, row.score);

    const weatherByGame = new Map<string, Awaited<ReturnType<typeof fetchGameWeather>>>();
    await mapWithConcurrency(games, 4, async (g) => {
      weatherByGame.set(
        g.external_game_id,
        await fetchGameWeather({
          externalGameId: g.external_game_id,
          homeTeam: g.home_team,
          kickoffAt: g.kickoff_at,
          isDome: g.is_dome,
        }),
      );
    });

    const priorSeasonStats = new Map<string, Awaited<ReturnType<typeof collectPlayerSeasonStats>>>();
    const currentSeasonStats = new Map<string, Awaited<ReturnType<typeof collectPlayerSeasonStats>>>();
    for (const player of weekPlayers) {
      const sid = parseSleeperExternalId(player.external_player_id);
      if (!sid) continue;
      currentSeasonStats.set(sid, collectPlayerSeasonStats(historyCtx, sid, season));
      if (priorCtx) {
        priorSeasonStats.set(sid, collectPlayerSeasonStats(priorCtx, sid, season - 1));
      } else {
        // Pull prior from historyCtx when it already scanned previous season.
        priorSeasonStats.set(sid, collectPlayerSeasonStats(historyCtx, sid, season - 1));
      }
    }

    // Seed depth order heuristically from carries/targets if SDIO missing.
    if (depthBySleeperId.size === 0) {
      const byTeamPos = new Map<string, Array<{ sid: string; touches: number }>>();
      for (const player of weekPlayers) {
        const sid = parseSleeperExternalId(player.external_player_id);
        if (!sid) continue;
        const stats = currentSeasonStats.get(sid) ?? priorSeasonStats.get(sid) ?? [];
        const touches =
          stats.reduce(
            (s, st) => s + Number(st.rush_att ?? 0) + Number(st.targets ?? 0),
            0,
          ) / Math.max(1, stats.length);
        const key = `${player.team}|${player.position}`;
        const list = byTeamPos.get(key) ?? [];
        list.push({ sid, touches });
        byTeamPos.set(key, list);
      }
      for (const list of byTeamPos.values()) {
        list.sort((a, b) => b.touches - a.touches);
        list.forEach((row, i) => depthBySleeperId.set(row.sid, i + 1));
      }
    }

    // Week 1 has no plays yet, so fall back to the prior season — that is the
    // window the rest of the Week 1 board already blends from.
    const goalLine = await loadGoalLineIndex([season, season - 1]).catch(
      () => ({ index: new Map(), season: null }) as Awaited<
        ReturnType<typeof loadGoalLineIndex>
      >,
    );

    const featureCtx: FeatureBuildContext = {
      season,
      week,
      historyCtx,
      priorSeasonStats,
      currentSeasonStats,
      defense,
      defenseLabel,
      rushTdRanks,
      recTdRanks,
      depthBySleeperId,
      teammateOutByTeam,
      projections: projectionScores,
      goalLine: goalLine.index,
      goalLineSeason: goalLine.season,
    };

    type BoardRow = Parameters<Store["replacePlayerWeekBoard"]>[1][number];
    const draft: Array<{
      row: BoardRow;
      features: ReturnType<typeof buildPlayerWeekFeatures>;
    }> = [];

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

      const features = buildPlayerWeekFeatures({
        externalPlayerId: player.external_player_id,
        playerName: player.name,
        team: player.team,
        position: player.position,
        opponent,
        game,
        weather,
        injuryStatus,
        injuryDetail: meta?.injury_status
          ? `${player.name}: ${meta.injury_status}`
          : null,
        ctx: featureCtx,
      });
      features.playerId = playerId;

      // Filter teammate outs that are the player themselves.
      features.teammateInjuryContext = features.teammateInjuryContext.filter(
        (n) => !n.toLowerCase().includes(player.name.toLowerCase().split(" ").at(-1) ?? "___"),
      );

      draft.push({
        features,
        row: {
          player_id: playerId,
          game_id: gameId,
          market_probability: 0,
          our_probability: 0,
          td_pool_score: 0,
          td_pool_rank: 0,
          matchup_rating: 1,
          goal_line_rating: 1,
          research_json: {
            why_we_like: [],
            concerns: [],
            verdict: "",
            red_zone: { carries: 0, targets: 0, touches_per_game: 0, share: 0 },
            goal_line: {
              carries_inside_10: 0,
              carries_inside_5: 0,
              team_share: 0,
              opportunities: 0,
            },
            matchup: {
              opponent,
              tds_allowed: 0,
              red_zone_td_rate: 0,
              rushing_tds_allowed: 0,
              receiving_tds_allowed: 0,
              position_rank_allowed: 16,
              notes: "",
            },
            usage: {
              snap_share: 0,
              carry_share: null,
              target_share: null,
              targets_per_game: null,
              end_zone_targets: null,
              recent_trend: "stable",
              last_games_summary: "",
            },
            game_environment: {
              spread: game.spread,
              total: game.total,
              team_implied_points: null,
              weather: {
                temperature_f: weather.temperature_f,
                wind_mph: weather.wind_mph,
                precip_chance: weather.precip_chance,
                severity: weather.severity,
                notes: weather.notes,
              },
            },
            injuries: {
              player_status: injuryStatus,
              player_detail: null,
              relevant: [],
            },
            market: { consensus_american: 0, consensus_implied: 0, books: [] },
          },
          injury_status: injuryStatus,
          availability:
            injuryStatus === "out" || injuryStatus === "injured_reserve"
              ? "injured"
              : injuryStatus === "questionable" || injuryStatus === "doubtful"
                ? "questionable"
                : "available",
          tier: "average",
          consensus_american_odds: 0,
          consensus_decimal_odds: 0,
        },
      });
    }

    const cohort = draft.map((d) => d.features);
    // Deterministic copy only during board build.
    // AI writeups run lazily on the player detail page — 60 parallel Gateway
    // calls here were timing out serverless rematerialize after AI keys were added.
    const scored = draft.map(({ features, row }) => {
      const model = computeTdPoolFromFeatures(features, cohort);
      const history = buildLivePlayerHistoryFromContext({
        sleeperPlayerId:
          parseSleeperExternalId(features.externalPlayerId) ?? "",
        team: features.team,
        opponent: features.opponent,
        ctx: historyCtx,
      });
      const analysis = buildDeterministicAnalysis(features, model);
      let research = featuresToResearchJson({
        features,
        history,
        model,
        analysis: {
          overview: analysis.overview,
          whyWeLike: analysis.whyWeLike,
          concerns: analysis.concerns,
          verdict: analysis.verdict,
        },
        injuryDetail:
          features.playerInjuryStatus !== "healthy"
            ? `${features.playerName}: ${features.playerInjuryStatus}`
            : null,
      });
      research = attachModelMeta(research, features, model);

      const tier =
        model.tdPoolProbability >= 0.55
          ? ("elite" as const)
          : model.tdPoolProbability >= 0.42
            ? ("strong" as const)
            : model.tdPoolProbability >= 0.3
              ? ("solid" as const)
              : model.tdPoolProbability >= 0.18
                ? ("average" as const)
                : ("long_shot" as const);

      return {
        ...row,
        our_probability: model.tdPoolProbability,
        td_pool_score: model.tdPoolProbability * 1000,
        matchup_rating: model.matchupStars,
        goal_line_rating: model.goalLineStars,
        research_json: research,
        tier,
      };
    });

    // Rank strictly by TD Pool %.
    scored.sort((a, b) => b.our_probability - a.our_probability);
    scored.forEach((row, idx) => {
      row.td_pool_rank = idx + 1;
    });

    // Persist the whole weekly pool. Capping the board hid real starters
    // (a top-60 cut dropped players like Ashton Jeanty and Justin Jefferson);
    // the UI filters and ranks instead.
    await store.replacePlayerWeekBoard(nflWeek.id, scored);

    // The board replace wiped market columns, so re-price immediately rather
    // than waiting for a client request to notice.
    try {
      const { syncWeekOdds } = await import("@/lib/services/sync-odds");
      await syncWeekOdds(store, { season, week, weekId: nflWeek.id });
    } catch (err) {
      console.error("post-materialize odds sync failed", err);
    }

    await store.completeSyncSlot(syncKey, "ok", {
      season,
      week,
      players: scored.length,
      model: TD_POOL_MODEL_VERSION,
    });
    return nflWeek;
  })()
    .catch(async (err) => {
      await store
        .completeSyncSlot(syncKey, "error", {
          message: err instanceof Error ? err.message : String(err),
        })
        .catch(() => {});
      throw err;
    })
    .finally(() => {
      materializeInFlight.delete(key);
    });

  materializeInFlight.set(key, run);
  return run;
}
