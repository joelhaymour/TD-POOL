import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { parseShareLink } from "@/lib/props/sportsbooks";
import { candidateGames } from "@/lib/tickets/load";
import { normalizeTicket, type TicketDraft } from "@/lib/tickets/normalize";
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
      const { raw, reader, usage } = await readTicketImage({
        image: { bytes: Buffer.from(await image.arrayBuffer()), mediaType: image.type },
        games,
        bookHint: share?.sportsbook ?? null,
      });
      if (usage) {
        console.log("ticket read", slug, `${usage.input} in / ${usage.output} out`);
      }
      return NextResponse.json({
        draft: normalizeTicket(raw, games, share?.sportsbook ?? null),
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
