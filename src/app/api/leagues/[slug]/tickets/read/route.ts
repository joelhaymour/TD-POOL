import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { parseShareLink } from "@/lib/props/sportsbooks";
import { candidateGames } from "@/lib/tickets/load";
import {
  normalizeTicket,
  playerKey,
  type PlayerGameLookup,
  type TicketDraft,
} from "@/lib/tickets/normalize";
import type { NflGame } from "@/lib/types";
import type { Store } from "@/lib/store/types";
import {
  readTicketImage,
  TicketReaderError,
  ticketReaderStatus,
} from "@/lib/tickets/reader";
import { TICKET_IMAGE_MAX_BYTES, TICKET_IMAGE_TYPES } from "@/lib/tickets/storage";
import { requireTickets } from "@/lib/tickets/access";

/** A vision call takes a few seconds; leave room for a slow one. */
export const maxDuration = 60;

function emptyDraft(book: TicketDraft["sportsbook"]): TicketDraft {
  return {
    sportsbook: book,
    bet_type: "unknown",
    stake: null,
    currency: null,
    book_odds: null,
    book_payout: null,
    legs: [],
    notes: null,
  };
}

/**
 * Which game each player is in, from the week's player data (the same rows
 * the TD board is built from). A name found in two of these games is left
 * alone. Failing to load it only means no backup for the read.
 */
async function playerGames(store: Store, games: NflGame[]): Promise<PlayerGameLookup> {
  try {
    const gameIds = new Set(games.map((g) => g.id));
    const weekIds = [...new Set(games.map((g) => g.week_id))];
    const [players, ...weeks] = await Promise.all([
      store.listPlayers(),
      ...weekIds.map((id) => store.getPlayerWeekData(id)),
    ]);
    const nameById = new Map(players.map((p) => [p.id, p.name]));
    const byName = new Map<string, Set<string>>();
    for (const row of weeks.flat()) {
      const name = nameById.get(row.player_id);
      if (!name || !gameIds.has(row.game_id)) continue;
      const key = playerKey(name);
      byName.set(key, (byName.get(key) ?? new Set()).add(row.game_id));
    }
    return (name) => {
      const found = byName.get(playerKey(name));
      return found && found.size === 1 ? [...found][0] : null;
    };
  } catch {
    return () => null;
  }
}

/** Member: what a ticket could be about — the games — and whether the reader is on. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]/tickets/read">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    const blocked = requireTickets(access.league);
    if (blocked) return blocked;
    const games = await candidateGames(getStore(), access.league);
    return NextResponse.json({ games, reader: ticketReaderStatus() });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

/**
 * Member: read a screenshot into legs. Nothing is saved here — the member
 * reviews what came back, fixes anything the read got wrong, and posts.
 * Multipart: `image`, and `text` when the paste carried the share link too.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/tickets/read">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;
    const blocked = requireTickets(access.league);
    if (blocked) return blocked;

    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json(
        { error: "Add the screenshot first", code: "VALIDATION" },
        { status: 400 },
      );
    }
    if (!TICKET_IMAGE_TYPES.has(image.type)) {
      return NextResponse.json(
        { error: "Screenshots must be JPEG, PNG or WebP", code: "VALIDATION" },
        { status: 400 },
      );
    }
    if (image.size > TICKET_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        { error: "That picture is too large", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const shareParse = parseShareLink(String(form.get("text") ?? ""));
    const share = shareParse.ok
      ? { sportsbook: shareParse.sportsbook, url: shareParse.url }
      : null;

    const store = getStore();
    const games = await candidateGames(store, access.league);
    if (games.length === 0) {
      return NextResponse.json(
        { error: "This week's schedule isn't loaded yet", code: "VALIDATION" },
        { status: 400 },
      );
    }

    if (ticketReaderStatus() === "off") {
      return NextResponse.json({
        draft: emptyDraft(share?.sportsbook ?? null),
        reader: "off",
        games,
        share,
      });
    }

    try {
      const [{ raw, reader, usage }, gameForPlayer] = await Promise.all([
        readTicketImage({
          image: { bytes: Buffer.from(await image.arrayBuffer()), mediaType: image.type },
          games,
          bookHint: share?.sportsbook ?? null,
        }),
        playerGames(store, games),
      ]);
      if (usage) {
        console.log("ticket read", slug, `${usage.input} in / ${usage.output} out`);
      }
      return NextResponse.json({
        draft: normalizeTicket(raw, games, share?.sportsbook ?? null, gameForPlayer),
        reader,
        games,
        share,
      });
    } catch (err) {
      if (err instanceof TicketReaderError) {
        return NextResponse.json(
          { error: err.message, code: err.code, games, share },
          { status: 502 },
        );
      }
      throw err;
    }
  } catch (err) {
    return storeErrorResponse(err);
  }
}
