"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ClipboardPaste, ImagePlus, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { BookBadge } from "@/components/tickets/book-badge";
import { blankLeg } from "@/components/tickets/leg-editor";
import { TicketFields, ticketPayload } from "@/components/tickets/ticket-fields";
import { apiError, apiForm, apiJson } from "@/lib/api/client";
import { readNativeClipboard } from "@/lib/native/clipboard";
import { parseShareLink, SHARE_BOOKS } from "@/lib/props/sportsbooks";
import type { TicketDraft, TicketLegDraft } from "@/lib/tickets/normalize";
import type { TicketReaderStatus } from "@/lib/tickets/reader";
import { shrinkImage, type ShrunkImage } from "@/lib/tickets/shrink-image";
import { cn } from "@/lib/utils/cn";
import type { Currency, NflGame } from "@/lib/types";

const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-field px-3 text-sm font-semibold text-ink outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";
const labelClass =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint";

type Picture = ShrunkImage & { url: string };

type ReadResponse = {
  draft: TicketDraft;
  reader: TicketReaderStatus;
  games: NflGame[];
  share: { sportsbook: string; url: string } | null;
  error?: string;
};

type Stage = "pick" | "reading" | "review" | "posting";

/**
 * Post a bet you placed. One paste carries the book's share — a picture of
 * the slip AND the ride link — so the whole sheet is a paste target; the
 * picture is read into legs, the member checks them, and the ticket goes up
 * for the league to follow and ride.
 */
export function PostTicketSheet({
  open,
  onClose,
  slug,
  currency,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  currency: Currency;
  onPosted: () => Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [shareText, setShareText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  /**
   * The camera roll is offered only once the clipboard has failed to deliver
   * a picture — the browser cannot read it, or a read came back with just the
   * link (Android has no "copy" on a screenshot). Never the front door: a file
   * picked first would leave the ride link behind.
   */
  const [offerPicker, setOfferPicker] = useState(false);
  /** Bumped on reset so a request that finishes after the sheet closed is ignored. */
  const session = useRef(0);
  const pictureRef = useRef<Picture | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [games, setGames] = useState<NflGame[]>([]);
  const [reader, setReader] = useState<TicketReaderStatus | null>(null);
  const [legs, setLegs] = useState<TicketLegDraft[]>([]);
  const [book, setBook] = useState<string | null>(null);
  const [stake, setStake] = useState("");
  const [odds, setOdds] = useState("");
  const [payout, setPayout] = useState("");
  const [notes, setNotes] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const legSeq = useRef(0);

  // Whether this site can read a picture at all, so the sheet says so up
  // front instead of after a tap that goes nowhere.
  const [readerHere, setReaderHere] = useState<TicketReaderStatus | null>(null);
  useEffect(() => {
    if (!open || readerHere != null) return;
    let cancelled = false;
    void apiJson<{ reader: TicketReaderStatus }>(`/api/leagues/${slug}/tickets/read`).then(
      (r) => {
        if (!cancelled && r.ok) setReaderHere(r.data.reader);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, readerHere, slug]);
  const readerOff = readerHere === "off";

  const reset = useCallback(() => {
    setStage("pick");
    if (pictureRef.current) URL.revokeObjectURL(pictureRef.current.url);
    pictureRef.current = null;
    setPicture(null);
    setShareText("");
    setHint(null);
    setOfferPicker(false);
    session.current += 1;
    setError(null);
    setLegs([]);
    setBook(null);
    setStake("");
    setOdds("");
    setPayout("");
    setNotes(null);
  }, []);

  function close() {
    reset();
    onClose();
  }

  const takePicture = useCallback(async (file: Blob) => {
    setError(null);
    try {
      const shrunk = await shrinkImage(file);
      if (pictureRef.current) URL.revokeObjectURL(pictureRef.current.url);
      const next = { ...shrunk, url: URL.createObjectURL(shrunk.blob) };
      pictureRef.current = next;
      setPicture(next);
      setHint(null);
      setOfferPicker(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file");
      return false;
    }
  }, []);

  /**
   * Only a real bet link is kept. Whatever else is on the clipboard — a
   * message, a stray URL — would sit in the link box, get posted, and fail
   * there, so it is refused here with a hint instead.
   */
  const takeLink = useCallback((text: string): boolean => {
    const parsed = parseShareLink(text);
    if (!parsed.ok) return false;
    setShareText(parsed.url);
    return true;
  }, []);

  /**
   * A book's share sheet copies the slip as a picture AND the link as text,
   * and one paste carries both. The listener sits on the sheet rather than on
   * one box, so a desktop Cmd+V lands wherever the reader happens to be.
   */
  useEffect(() => {
    if (!open || stage !== "pick") return;
    const onPaste = (e: globalThis.ClipboardEvent) => {
      // The link box below handles its own paste.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const data = e.clipboardData;
      if (!data) return;
      const image = [...data.items].find((i) => i.type.startsWith("image/"))?.getAsFile();
      const text = data.getData("text/plain")?.trim();
      if (!image && !text) return;
      e.preventDefault();
      setHint(null);
      if (image) void takePicture(image);
      if (text && !takeLink(text)) {
        setHint("That text wasn't a bet link. In your book, open the bet and tap Share.");
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open, stage, takePicture, takeLink]);

  /**
   * Tapping the box reads the clipboard itself: on a phone that is the only
   * way to reach the picture, and tapping is what everyone does first.
   */
  async function pasteFromClipboard() {
    if (stage !== "pick") return;
    setHint(null);
    const hadPicture = pictureRef.current != null;
    let gotImage = false;
    let gotLink = false;
    let gotText = false;
    // In the iOS app the native pasteboard is read directly: the picture and
    // the link come together, and iOS asks with a clear Allow/Don't Allow
    // alert instead of a bubble. Anywhere else this is null.
    const native = await readNativeClipboard().catch(() => null);
    if (native?.denied) {
      setHint("iPhone blocked the paste. Tap Allow when it asks, or turn it on in Settings › Pool’d › Paste from Other Apps.");
      return;
    }
    const web = native
      ? null
      : ((navigator.clipboard ?? null) as
          | (Clipboard & { read?: () => Promise<ClipboardItem[]> })
          | null);

    // No clipboard API at all (some in-app browsers): the roll is the only way.
    if (!native && !web) {
      setOfferPicker(true);
      setHint("This browser can't paste here. Choose the screenshot from your photos and paste the link into the box below.");
      return;
    }

    try {
      if (native) {
        if (native.text) {
          gotText = true;
          gotLink = takeLink(native.text);
        }
        if (native.image) gotImage = await takePicture(native.image);
      } else if (web && typeof web.read === "function") {
        // Read every part first — the image is shrunk afterwards, so a slow
        // resize can never leave the link unread.
        const items = await web.read();
        let imageBlob: Blob | null = null;
        let text = "";
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType && !imageBlob) imageBlob = await item.getType(imageType);
          // A copied URL can arrive as text/uri-list with no text/plain.
          const textType = ["text/plain", "text/uri-list"].find((t) => item.types.includes(t));
          if (textType && !text) text = (await (await item.getType(textType)).text()).trim();
        }
        if (text) {
          gotText = true;
          gotLink = takeLink(text);
        }
        if (imageBlob) gotImage = await takePicture(imageBlob);
      } else if (web) {
        // readText only (older WebKit): a picture can never come this way.
        const text = (await web.readText()).trim();
        if (text) {
          gotText = true;
          gotLink = takeLink(text);
        }
        if (!hadPicture) {
          setOfferPicker(true);
          setHint(
            gotLink
              ? "Got the link. This browser can't paste pictures — choose the screenshot from your photos below."
              : "This browser can't paste pictures — choose the screenshot from your photos below.",
          );
          return;
        }
      }
    } catch (err) {
      // On a phone the tap pops a Paste bubble; not tapping it rejects the
      // read. That is not a browser that cannot paste — say so, and keep the
      // roll out of it. Anything else is a real inability.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setHint("Tap the box, then tap Paste on the bubble that pops up.");
        return;
      }
      if (!hadPicture && !gotImage) setOfferPicker(true);
      setHint("Couldn't read the clipboard here. Choose the screenshot from your photos below and paste the link into the box.");
      return;
    }

    const havePicture = gotImage || hadPicture;
    if (!gotImage && !gotText) {
      setHint("Nothing on the clipboard. In your book: open the bet, tap Share, then copy it.");
      if (!havePicture) setOfferPicker(true);
    } else if (gotText && !gotLink && !gotImage) {
      setHint("That text wasn't a bet link. In your book, open the bet and tap Share.");
    } else if (!havePicture) {
      // Link in hand, no picture. On Android there is no "copy" on a
      // screenshot, so the roll is offered alongside a second tap.
      setOfferPicker(true);
      setHint("Got the link. Now add the screenshot: copy it and tap the box again, or choose it from your photos.");
    } else if (gotImage && !gotLink && !shareText.trim()) {
      setHint("Got the picture. For a Ride button, copy the share link from your book and tap again — the picture stays.");
    }
  }

  async function readTicket() {
    if (!picture) return;
    const s = session.current;
    setStage("reading");
    setError(null);
    const form = new FormData();
    form.append("image", picture.blob, "ticket.jpg");
    if (shareText.trim()) form.append("text", shareText.trim());
    let r: Awaited<ReturnType<typeof apiForm<ReadResponse>>>;
    try {
      r = await apiForm<ReadResponse>(`/api/leagues/${slug}/tickets/read`, form);
    } catch {
      if (s !== session.current) return;
      setError("Couldn't reach the server — check your connection and try again.");
      setStage("pick");
      return;
    }
    if (s !== session.current) return;
    if (!r.ok) {
      setError(apiError(r) ?? "Couldn't read the ticket");
      // A failed read is still a ticket: fall through to entering it by hand.
      if (r.data.games) {
        setGames(r.data.games);
        setReader("off");
        setBook(r.data.share?.sportsbook ?? null);
        setStage("review");
        return;
      }
      setStage("pick");
      return;
    }
    const { draft, games: gs, reader: status, share } = r.data;
    setGames(gs);
    setReader(status);
    setBook(draft.sportsbook ?? share?.sportsbook ?? null);
    // A read that found nothing still needs a leg to edit, or Post is
    // disabled with no way to see why.
    setLegs(draft.legs.length > 0 ? draft.legs : [blankLeg(`leg-${++legSeq.current}`)]);
    setStake(draft.stake != null ? String(draft.stake) : "");
    setOdds(draft.book_odds != null ? String(draft.book_odds) : "");
    setPayout(draft.book_payout != null ? String(draft.book_payout) : "");
    setNotes(draft.notes);
    if (share?.url) setShareText(share.url);
    setStage("review");
  }

  async function enterByHand() {
    setError(null);
    const s = session.current;
    let r: Awaited<ReturnType<typeof apiJson<{ games: NflGame[]; reader: TicketReaderStatus }>>>;
    try {
      r = await apiJson<{ games: NflGame[]; reader: TicketReaderStatus }>(
        `/api/leagues/${slug}/tickets/read`,
      );
    } catch {
      if (s === session.current) setError("Couldn't reach the server — check your connection and try again.");
      return;
    }
    if (s !== session.current) return;
    if (!r.ok) {
      setError(apiError(r) ?? "Couldn't load this week's games");
      return;
    }
    setGames(r.data.games);
    // Nothing was read; the label should not claim otherwise.
    setReader("off");
    setLegs([blankLeg(`leg-${++legSeq.current}`)]);
    setStage("review");
  }

  function updateLeg(next: TicketLegDraft) {
    setLegs((cur) => cur.map((l) => (l.key === next.key ? next : l)));
  }

  async function post(e: FormEvent) {
    e.preventDefault();
    if (stage !== "review") return;
    setStage("posting");
    setError(null);
    // No name to type: the server titles it from its legs, and the card
    // leads with the poster anyway.
    const payload = ticketPayload(book, { stake, odds, payout, shareText }, legs);
    const form = new FormData();
    form.append("payload", JSON.stringify(payload));
    if (picture) form.append("image", picture.blob, "ticket.jpg");
    const s = session.current;
    let r: Awaited<ReturnType<typeof apiForm>>;
    try {
      r = await apiForm(`/api/leagues/${slug}/tickets`, form);
    } catch {
      if (s !== session.current) return;
      setError("Couldn't reach the server — your legs are still here, try again.");
      setStage("review");
      return;
    }
    if (s !== session.current) return;
    if (!r.ok) {
      setError(apiError(r) ?? "Couldn't post the ticket");
      setStage("review");
      return;
    }
    await onPosted();
    close();
  }

  const blocked = legs.length === 0 || legs.some((l) => l.issues.length > 0);

  return (
    <Sheet
      open={open}
      onClose={close}
      title={stage === "review" || stage === "posting" ? "Check your ticket" : "Post a ticket"}
      description={
        stage === "review" || stage === "posting"
          ? "Fix anything the read got wrong, then post it for the league."
          : "Copy the bet in your book, then paste it here — the picture and the ride link come over together."
      }
    >
      {stage === "pick" || stage === "reading" ? (
        <div className="space-y-3 pb-2">
          {/* One tap reads the clipboard, because a book's share puts the
              slip's picture and its ride link there together — picking a file
              from the camera roll would drop the link and the Ride button
              with it. */}
          <button
            type="button"
            disabled={stage === "reading"}
            aria-busy={stage === "reading"}
            onClick={() => void pasteFromClipboard()}
            className={cn(
              "flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-center transition active:scale-[0.99] disabled:opacity-60",
              picture
                ? "border-lime/40 bg-lime/[0.05]"
                : "border-border-strong bg-field hover:border-turf",
            )}
          >
            {picture ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={picture.url}
                  alt="Your bet slip"
                  className="max-h-56 rounded-lg object-contain shadow-card"
                  draggable={false}
                />
                <span className="text-[11px] text-ink-faint">
                  {shareText.trim()
                    ? "Tap to paste a different one"
                    : "Tap again to add the ride link, or paste a different slip"}
                </span>
              </>
            ) : (
              <>
                <ClipboardPaste className="h-7 w-7 text-turf" aria-hidden />
                <span className="text-sm font-semibold text-ink">
                  {shareText.trim()
                    ? "Tap to add a screenshot of the bet slip"
                    : "Tap to paste your ticket"}
                </span>
                <span className="text-xs text-ink-muted">
                  {shareText.trim()
                    ? "Copy the screenshot, then tap here"
                    : "In your book: open the bet, tap Share, then copy it"}
                </span>
              </>
            )}
          </button>
          {hint ? <p className="text-[11px] text-warning">{hint}</p> : null}

          {/* Only after the clipboard failed to deliver a picture. Any link
              is already in the box below, so nothing is lost this way. */}
          {offerPicker && !picture ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void takePicture(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus className="h-4 w-4" /> Choose the screenshot from your photos
              </Button>
            </>
          ) : null}

          <label className="block">
            <span className={labelClass}>Share link (so friends can ride it)</span>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              className={inputClass}
              value={shareText}
              placeholder="https://…"
              onChange={(e) => setShareText(e.target.value)}
              onPaste={(e) => {
                // On a phone this field is the one place a long-press can
                // paste into, and the book's share carries the picture too.
                const data = e.clipboardData;
                const image = data
                  ? [...data.items].find((i) => i.type.startsWith("image/"))?.getAsFile()
                  : null;
                const text = data?.getData("text/plain")?.trim();
                if (image) void takePicture(image);
                if (text) {
                  e.preventDefault();
                  if (!takeLink(text)) setShareText(text);
                }
              }}
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          {readerOff ? (
            <>
              <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Reading pictures isn&apos;t switched on for this site yet, so the
                legs go in by hand. The screenshot is still saved with the ticket.
              </p>
              <Button type="button" fullWidth size="lg" onClick={() => void enterByHand()}>
                Enter the legs
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                fullWidth
                size="lg"
                disabled={!picture || stage === "reading"}
                onClick={() => void readTicket()}
              >
                <ScanLine className="h-4 w-4" />
                {stage === "reading" ? "Reading your ticket…" : "Read the ticket"}
              </Button>
              <button
                type="button"
                className="block w-full text-center text-xs font-bold uppercase tracking-wider text-ink-faint hover:text-ink"
                onClick={() => void enterByHand()}
              >
                Or enter the legs by hand
              </button>
            </>
          )}

          <div className="rounded-xl border border-border bg-field p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              Where to find it
            </p>
            <ul className="mt-1.5 space-y-1">
              {SHARE_BOOKS.map((b) => (
                <li key={b.key} className="text-[11px] text-ink-faint">
                  <span className="font-semibold text-ink">{b.name}</span> · {b.shareHint}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <form className="space-y-4 pb-2" onSubmit={post}>
          <div className="flex items-center gap-3">
            {picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picture.url}
                alt="Your bet slip"
                className="h-16 w-12 shrink-0 rounded-md object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <BookBadge book={book} />
                <span className="text-[11px] text-ink-faint">
                  {reader === "claude"
                    ? "Read from your screenshot — check each leg"
                    : reader === "fixture"
                      ? "Sample read (reader off here)"
                      : "Legs go in by hand"}
                </span>
              </div>
              {notes ? <p className="mt-1 text-[11px] text-warning">{notes}</p> : null}
            </div>
          </div>

          <TicketFields
            legs={legs}
            onLegChange={updateLeg}
            onLegRemove={(key) => setLegs((cur) => cur.filter((l) => l.key !== key))}
            onAddLeg={() => setLegs((cur) => [...cur, blankLeg(`leg-${++legSeq.current}`)])}
            games={games}
            money={{ stake, odds, payout, shareText }}
            onMoney={(patch) => {
              if (patch.stake !== undefined) setStake(patch.stake);
              if (patch.odds !== undefined) setOdds(patch.odds);
              if (patch.payout !== undefined) setPayout(patch.payout);
              if (patch.shareText !== undefined) setShareText(patch.shareText);
            }}
            currency={currency}
          />

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button type="submit" fullWidth size="lg" disabled={blocked || stage === "posting"}>
            {stage === "posting" ? "Posting…" : "Post ticket"}
          </Button>
          {blocked && legs.length > 0 ? (
            <p className="text-center text-[11px] text-ink-faint">
              Fill in the flagged legs to post.
            </p>
          ) : null}
        </form>
      )}
    </Sheet>
  );
}
