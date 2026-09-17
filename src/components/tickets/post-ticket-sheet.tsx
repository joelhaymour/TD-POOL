"use client";

import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { ClipboardPaste, ImagePlus, Plus, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { BookBadge } from "@/components/tickets/book-badge";
import { LegEditor, blankLeg } from "@/components/tickets/leg-editor";
import { apiError, apiForm, apiJson } from "@/lib/api/client";
import { SHARE_BOOKS } from "@/lib/props/sportsbooks";
import { autoTicketTitle } from "@/lib/tickets/format";
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
 * Post a bet you placed. Paste the book's share (it carries a picture of the
 * slip and the link together), or choose the screenshot; the picture is read
 * into legs, the member checks them, and the ticket goes up for the league
 * to follow and ride.
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
  const [error, setError] = useState<string | null>(null);

  const [games, setGames] = useState<NflGame[]>([]);
  const [reader, setReader] = useState<TicketReaderStatus | null>(null);
  const [legs, setLegs] = useState<TicketLegDraft[]>([]);
  // The title follows the legs until the member types their own.
  const [ownTitle, setOwnTitle] = useState<string | null>(null);
  const readyLegs = legs.filter((l) => l.market_key && l.issues.length === 0);
  const title =
    ownTitle ??
    (readyLegs.length > 0
      ? autoTicketTitle(readyLegs.map((l) => ({ ...l, market_key: l.market_key! })))
      : "");
  const [book, setBook] = useState<string | null>(null);
  const [stake, setStake] = useState("");
  const [odds, setOdds] = useState("");
  const [payout, setPayout] = useState("");
  const [notes, setNotes] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const legSeq = useRef(0);

  const reset = useCallback(() => {
    setStage("pick");
    if (picture) URL.revokeObjectURL(picture.url);
    setPicture(null);
    setShareText("");
    setHint(null);
    setError(null);
    setLegs([]);
    setOwnTitle(null);
    setBook(null);
    setStake("");
    setOdds("");
    setPayout("");
    setNotes(null);
  }, [picture]);

  function close() {
    reset();
    onClose();
  }

  async function takePicture(file: Blob) {
    setError(null);
    try {
      const shrunk = await shrinkImage(file);
      setPicture((cur) => {
        if (cur) URL.revokeObjectURL(cur.url);
        return { ...shrunk, url: URL.createObjectURL(shrunk.blob) };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file");
    }
  }

  /**
   * A book's share sheet copies the slip as a picture AND the link as text.
   * Both come off one paste event: the picture becomes the screenshot, the
   * text becomes the ride link.
   */
  function onPaste(e: ClipboardEvent) {
    const data = e.clipboardData;
    if (!data) return;
    const image = [...data.items].find((i) => i.type.startsWith("image/"))?.getAsFile();
    const text = data.getData("text/plain")?.trim();
    if (!image && !text) return;
    e.preventDefault();
    setHint(null);
    if (image) void takePicture(image);
    if (text) setShareText(text);
  }

  /** The Paste button, for when the zone can't take a paste (some in-app browsers). */
  async function pasteFromClipboard() {
    setHint(null);
    try {
      let gotImage = false;
      let gotText = false;
      // Older WebKit has readText but not read(); the picture is then out of
      // reach and the member is pointed at the file picker.
      const clipboard = navigator.clipboard as Clipboard & {
        read?: () => Promise<ClipboardItem[]>;
      };
      if (typeof clipboard.read === "function") {
        const items = await clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType && !gotImage) {
            await takePicture(await item.getType(imageType));
            gotImage = true;
          }
          if (item.types.includes("text/plain") && !gotText) {
            const text = (await (await item.getType("text/plain")).text()).trim();
            if (text) {
              setShareText(text);
              gotText = true;
            }
          }
        }
      } else {
        const text = (await navigator.clipboard.readText()).trim();
        if (text) {
          setShareText(text);
          gotText = true;
        }
      }
      if (!gotImage && !gotText) {
        setHint("Nothing on the clipboard. In the book, open the bet and tap Share.");
      } else if (!gotImage) {
        setHint("Got the link. Add the screenshot with Choose screenshot.");
      }
    } catch {
      setHint("Couldn't read the clipboard here — use Choose screenshot, or long-press the box and paste.");
    }
  }

  async function readTicket() {
    if (!picture) return;
    setStage("reading");
    setError(null);
    const form = new FormData();
    form.append("image", picture.blob, "ticket.jpg");
    if (shareText.trim()) form.append("text", shareText.trim());
    const r = await apiForm<ReadResponse>(`/api/leagues/${slug}/tickets/read`, form);
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
    setLegs(draft.legs);
    setStake(draft.stake != null ? String(draft.stake) : "");
    setOdds(draft.book_odds != null ? String(draft.book_odds) : "");
    setPayout(draft.book_payout != null ? String(draft.book_payout) : "");
    setNotes(draft.notes);
    if (share?.url) setShareText(share.url);
    setStage("review");
  }

  async function enterByHand() {
    setError(null);
    const r = await apiJson<{ games: NflGame[]; reader: TicketReaderStatus }>(
      `/api/leagues/${slug}/tickets/read`,
    );
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
    const num = (s: string) => {
      const n = Number.parseFloat(s.replace(/[^0-9.+-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const payload = {
      title: title.trim() || undefined,
      sportsbook: book,
      stake: num(stake),
      book_odds: (() => {
        const n = num(odds);
        return n != null && n !== 0 ? Math.round(n) : null;
      })(),
      book_payout: num(payout),
      share_url: shareText.trim() || undefined,
      legs: legs.map((l) => ({
        game_id: l.game_id,
        market_key: l.market_key,
        player_name: l.player_name,
        outcome_label: l.outcome_label,
        line: l.line,
        american_odds: l.american_odds,
      })),
    };
    const form = new FormData();
    form.append("payload", JSON.stringify(payload));
    if (picture) form.append("image", picture.blob, "ticket.jpg");
    const r = await apiForm(`/api/leagues/${slug}/tickets`, form);
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
          : "Share the bet from your book, or add a screenshot of the slip."
      }
    >
      {stage === "pick" || stage === "reading" ? (
        <div className="space-y-3 pb-2">
          {/* Editable so a long-press offers Paste on iOS; the paste itself is
              intercepted and nothing is ever typed into it. */}
          <div
            role="button"
            tabIndex={0}
            contentEditable
            suppressContentEditableWarning
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInput.current?.click();
              } else if (!(e.metaKey || e.ctrlKey)) {
                e.preventDefault();
              }
            }}
            onClick={() => {
              if (!picture) fileInput.current?.click();
            }}
            className={cn(
              "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-center outline-none caret-transparent transition focus:border-turf",
              picture ? "border-lime/40 bg-lime/[0.05]" : "border-border-strong bg-field",
            )}
            aria-label="Paste or choose the bet slip screenshot"
          >
            {picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picture.url}
                alt="Your bet slip"
                className="max-h-56 rounded-lg object-contain shadow-card"
                draggable={false}
              />
            ) : (
              <>
                <ImagePlus className="h-7 w-7 text-turf" aria-hidden />
                <p className="text-sm font-semibold text-ink">Paste your ticket here</p>
                <p className="text-xs text-ink-muted">
                  or tap to choose the screenshot
                </p>
              </>
            )}
          </div>
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

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => void pasteFromClipboard()}>
              <ClipboardPaste className="h-4 w-4" /> Paste
            </Button>
            <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="h-4 w-4" /> {picture ? "Swap picture" : "Choose screenshot"}
            </Button>
          </div>
          {hint ? <p className="text-[11px] text-warning">{hint}</p> : null}

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
                const text = e.clipboardData?.getData("text/plain")?.trim();
                if (text) {
                  e.preventDefault();
                  setShareText(text);
                }
              }}
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

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
                    ? "Read from your screenshot"
                    : reader === "fixture"
                      ? "Sample read (reader off here)"
                      : "Entered by hand"}
                </span>
              </div>
              {notes ? <p className="mt-1 text-[11px] text-warning">{notes}</p> : null}
            </div>
          </div>

          <label className="block">
            <span className={labelClass}>Name it</span>
            <input
              className={inputClass}
              value={title}
              maxLength={60}
              placeholder="DJ Moore + 2 more"
              onChange={(e) => setOwnTitle(e.target.value)}
            />
          </label>

          <div>
            <span className={labelClass}>Legs</span>
            <ul className="space-y-2">
              {legs.map((leg) => (
                <LegEditor
                  key={leg.key}
                  leg={leg}
                  games={games}
                  onChange={updateLeg}
                  onRemove={() => setLegs((cur) => cur.filter((l) => l.key !== leg.key))}
                />
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-xs font-bold uppercase tracking-wide text-ink-muted transition hover:text-ink"
              onClick={() => setLegs((cur) => [...cur, blankLeg(`leg-${++legSeq.current}`)])}
            >
              <Plus className="h-4 w-4" /> Add a leg
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className={labelClass}>Stake ({currency})</span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={stake}
                placeholder="20"
                onChange={(e) => setStake(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Odds</span>
              <input
                className={inputClass}
                inputMode="numeric"
                value={odds}
                placeholder="+612"
                onChange={(e) => setOdds(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>To win</span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={payout}
                placeholder="142.40"
                onChange={(e) => setPayout(e.target.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Share link</span>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              className={inputClass}
              value={shareText}
              placeholder="https://…"
              onChange={(e) => setShareText(e.target.value)}
            />
          </label>

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
