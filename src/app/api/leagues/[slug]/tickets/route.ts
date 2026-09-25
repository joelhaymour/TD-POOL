import { after, NextResponse } from "next/server";
import { notifyTicketPosted } from "@/lib/notify/events";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { propMarketDef } from "@/lib/props/markets";
import { parseShareLink, sportsbook } from "@/lib/props/sportsbooks";
import { refreshGroupLeague } from "@/lib/services/refresh-group-league";
import { requireTickets } from "@/lib/tickets/access";
import { autoTicketTitle } from "@/lib/tickets/format";
import { feedTickets, loadTickets, ticketWeekId } from "@/lib/tickets/load";
import { legDecimal, legIssues, resolveTeamFull } from "@/lib/tickets/normalize";
import {
  removeTicketImage,
  TICKET_IMAGE_MAX_BYTES,
  TICKET_IMAGE_TYPES,
  uploadTicketImage,
} from "@/lib/tickets/storage";
import type { NewParlayLeg } from "@/lib/types";

/** Reads a screenshot upload and writes a slip; the default timeout is tight for both. */
export const maxDuration = 60;

function bad(error: string) {
  return NextResponse.json({ error, code: "VALIDATION" }, { status: 400 });
}

/** Member: every ticket still in play, plus this week's settled ones. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/tickets">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    const blocked = requireTickets(access.league);
    if (blocked) return blocked;

    // Scores and grading ride along with the feed's poll.
    after(() => refreshGroupLeague(slug));

    const { tickets, games } = await loadTickets(getStore(), access.league, access.member.id);
    return NextResponse.json({
      tickets: feedTickets(tickets),
      games,
      weekId: access.league.active_week_id,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

type LegPayload = {
  game_id?: unknown;
  market_key?: unknown;
  player_name?: unknown;
  outcome_label?: unknown;
  line?: unknown;
  american_odds?: unknown;
};

type TicketPayload = {
  title?: unknown;
  sportsbook?: unknown;
  stake?: unknown;
  book_odds?: unknown;
  book_payout?: unknown;
  share_url?: unknown;
  legs?: unknown;
};

function numOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Member: post a ticket — the legs as reviewed on the phone, the slip's own
 * numbers, the share link, and the screenshot it was read from.
 * Multipart: `payload` (JSON) and optionally `image`.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/tickets">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    const blocked = requireTickets(access.league);
    if (blocked) return blocked;
    if (!access.league.active_week_id) return bad("League has no active week yet");

    const form = await request.formData();
    let payload: TicketPayload;
    try {
      payload = JSON.parse(String(form.get("payload") ?? "{}")) as TicketPayload;
    } catch {
      return bad("Ticket details were unreadable");
    }

    const rawLegs = Array.isArray(payload.legs) ? (payload.legs as LegPayload[]) : [];
    if (rawLegs.length === 0) return bad("Add at least one leg");
    if (rawLegs.length > 25) return bad("That's more legs than a slip can hold");

    const book = strOrNull(payload.sportsbook);
    const bookKey = book ? (sportsbook(book)?.key ?? null) : null;

    // Every leg is checked the way the review screen checks it, so nothing a
    // stale client sends can slip through half-filled.
    const drafts = rawLegs.map((l) => ({
      game_id: strOrNull(l.game_id),
      market_key: strOrNull(l.market_key),
      player_name: strOrNull(l.player_name),
      outcome_label: strOrNull(l.outcome_label) ?? "",
      line: numOrNull(l.line),
      american_odds: numOrNull(l.american_odds),
    }));
    const firstIssue = drafts.flatMap((d) => legIssues(d))[0];
    if (firstIssue) return bad(`A leg still needs something: ${firstIssue.toLowerCase()}`);

    const store = getStore();
    const games = await store.listGamesByIds([
      ...new Set(drafts.map((d) => d.game_id!)),
    ]);
    const gamesById = new Map(games.map((g) => [g.id, g]));
    if (drafts.some((d) => !gamesById.has(d.game_id!))) {
      return bad("One of those games isn't on the schedule");
    }
    if (games.every((g) => g.status === "final" || g.status === "canceled")) {
      return bad("Those games are already over");
    }

    const image = form.get("image");
    let screenshotPath: string | null = null;
    if (image instanceof File && image.size > 0) {
      if (!TICKET_IMAGE_TYPES.has(image.type)) return bad("Screenshots must be JPEG, PNG or WebP");
      if (image.size > TICKET_IMAGE_MAX_BYTES) return bad("That picture is too large");
      screenshotPath = await uploadTicketImage(
        access.league.id,
        Buffer.from(await image.arrayBuffer()),
        image.type,
      );
    }

    const legInputs = drafts.map((d) => {
      const def = propMarketDef(d.market_key!)!;
      const teamMarket = /^(h2h|spreads|alternate_spreads)/.test(def.key);
      const outcome = teamMarket
        ? resolveTeamFull(d.outcome_label)!
        : d.outcome_label;
      return {
        market_key: def.key,
        market_label: def.label,
        player_name:
          def.key === "team_totals" ? resolveTeamFull(d.player_name) : d.player_name,
        outcome_label: outcome,
        line: d.line,
        american_odds: d.american_odds,
        decimal_odds: legDecimal(d.american_odds),
        game_id: d.game_id!,
      };
    });

    const title =
      strOrNull(payload.title)?.slice(0, 60) ?? autoTicketTitle(legInputs);
    const parlay = await store.createParlay({
      league_id: access.league.id,
      week_id: ticketWeekId(games, access.league.active_week_id),
      title,
      created_by_member_id: access.member.id,
      kind: "ticket",
      status: "locked",
      stake: numOrNull(payload.stake),
      sportsbook: bookKey ?? book,
      book_odds: numOrNull(payload.book_odds),
      book_payout: numOrNull(payload.book_payout),
      screenshot_path: screenshotPath,
    });

    try {
      await store.addParlayLegs(
        legInputs.map(
          (l): NewParlayLeg => ({
            parlay_id: parlay.id,
            league_id: access.league.id,
            member_id: access.member.id,
            game_prop_id: null,
            sportsbook: bookKey ?? book ?? "ticket",
            fd_market_id: null,
            fd_selection_id: null,
            deep_link: null,
            ...l,
          }),
        ),
      );
    } catch (err) {
      // Half a ticket is worse than none: take the slip back out.
      await store.deleteParlay(parlay.id).catch(() => {});
      if (screenshotPath) await removeTicketImage(screenshotPath);
      throw err;
    }

    const share = parseShareLink(strOrNull(payload.share_url) ?? "");
    if (share.ok) {
      await store.saveParlayShareLink({
        parlay_id: parlay.id,
        league_id: access.league.id,
        member_id: access.member.id,
        sportsbook: share.sportsbook,
        url: share.url,
        note: null,
      });
    }

    // A ticket on a game already under way should show its running stats now.
    after(() => refreshGroupLeague(slug));

    const ticket = await store.getParlay(parlay.id);
    if (ticket) {
      const { league, member } = access;
      after(() => notifyTicketPosted(league, ticket, member));
    }
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
