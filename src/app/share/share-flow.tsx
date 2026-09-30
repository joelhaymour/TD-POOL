"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardPaste, ImagePlus, Loader2, X } from "lucide-react";
import { glassButton } from "@/components/layout/league-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BookBadge } from "@/components/tickets/book-badge";
import { blankLeg } from "@/components/tickets/leg-editor";
import { TicketFields, ticketPayload, type TicketMoney } from "@/components/tickets/ticket-fields";
import { apiError, apiForm, apiJson } from "@/lib/api/client";
import { readNativeClipboard } from "@/lib/native/clipboard";
import { takeSharedTicket, type SharedTicket } from "@/lib/native/share-inbox";
import { parseShareLink } from "@/lib/props/sportsbooks";
import type { TicketDraft, TicketLegDraft } from "@/lib/tickets/normalize";
import type { TicketReaderStatus } from "@/lib/tickets/reader";
import { shrinkImage, type ShrunkImage } from "@/lib/tickets/shrink-image";
import { cn } from "@/lib/utils/cn";
import type { Currency, NflGame } from "@/lib/types";

export type ShareLeague = { slug: string; name: string; currency: Currency; pinned: boolean };

type ReadResponse = {
  draft: TicketDraft;
  reader: TicketReaderStatus;
  games: NflGame[];
  share: { sportsbook: string; url: string } | null;
};
type Phase = "waiting" | "empty" | "reading" | "review" | "posting";

const REMEMBER_KEY = "poold:share-leagues";
const EMPTY_MONEY: TicketMoney = { stake: "", odds: "", payout: "", shareText: "" };

function rememberedLeagues(available: string[]): string[] {
  if (available.length === 1) return available;
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((s): s is string => available.includes(s as string)) : [];
  } catch {
    return [];
  }
}

export function ShareFlow({ leagues }: { leagues: ShareLeague[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [picture, setPicture] = useState<(ShrunkImage & { url: string }) | null>(null);
  // Last time's choice. Read at start-up: the list only shows after the
  // spinner, so the server render and the first client render still match.
  const [selected, setSelected] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : rememberedLeagues(leagues.map((l) => l.slug)),
  );
  const [games, setGames] = useState<NflGame[]>([]);
  const [reader, setReader] = useState<TicketReaderStatus | null>(null);
  const [legs, setLegs] = useState<TicketLegDraft[]>([]);
  const [book, setBook] = useState<string | null>(null);
  const [money, setMoney] = useState<TicketMoney>(EMPTY_MONEY);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<Array<{ name: string; why: string }>>([]);
  const legSeq = useRef(0);
  const started = useRef(false);

  // The read needs a league for its schedule; the games are the same for all.
  const readSlug = leagues[0]?.slug;

  const start = useCallback(
    async (shared: SharedTicket) => {
      if (!readSlug) return;
      started.current = true;
      setError(null);
      const link = parseShareLink(shared.text);
      const shareText = link.ok ? link.url : "";
      setMoney({ ...EMPTY_MONEY, shareText });
      let shrunk: ShrunkImage | null = null;
      if (shared.image) {
        try {
          shrunk = await shrinkImage(shared.image);
          setPicture({ ...shrunk, url: URL.createObjectURL(shrunk.blob) });
        } catch {
          setError("That picture couldn't be opened.");
        }
      }

      if (!shrunk) {
        // A link-only share (Stake): the legs go in by hand.
        const r = await apiJson<{ games: NflGame[] }>(`/api/leagues/${readSlug}/tickets/read`);
        if (r.ok) setGames(r.data.games);
        setReader("off");
        setLegs([blankLeg(`leg-${++legSeq.current}`)]);
        setPhase("review");
        return;
      }

      setPhase("reading");
      const form = new FormData();
      form.append("image", shrunk.blob, "ticket.jpg");
      if (shared.text) form.append("text", shared.text);
      const r = await apiForm<ReadResponse & { games?: NflGame[] }>(`/api/leagues/${readSlug}/tickets/read`, form).catch(
        () => null,
      );
      if (!r || !r.ok) {
        setError(r ? (apiError(r) ?? "Couldn't read the ticket — fill in the legs below.") : "Couldn't reach the server.");
        if (r?.data?.games) setGames(r.data.games);
        setReader("off");
        setLegs([blankLeg(`leg-${++legSeq.current}`)]);
        setPhase("review");
        return;
      }
      const { draft, games: gs, reader: status, share } = r.data;
      setGames(gs);
      setReader(status);
      setBook(draft.sportsbook ?? share?.sportsbook ?? null);
      setLegs(draft.legs.length > 0 ? draft.legs : [blankLeg(`leg-${++legSeq.current}`)]);
      setMoney({
        stake: draft.stake != null ? String(draft.stake) : "",
        odds: draft.book_odds != null ? String(draft.book_odds) : "",
        payout: draft.book_payout != null ? String(draft.book_payout) : "",
        shareText: share?.url ?? shareText,
      });
      setNotes(draft.notes);
      setPhase("review");
    },
    [readSlug],
  );

  // Pick up what the share extension left, once.
  useEffect(() => {
    let cancelled = false;
    void takeSharedTicket()
      .catch(() => null)
      .then((shared) => {
        if (cancelled || started.current) return;
        if (shared) void start(shared);
        else setPhase("empty");
      });
    // Local testing: dispatch a "poold:share" event with { image: dataURL, text }.
    const onTest = async (e: Event) => {
      if (process.env.NODE_ENV === "production") return;
      const detail = (e as CustomEvent<{ image?: string; text?: string }>).detail ?? {};
      const image = detail.image ? await (await fetch(detail.image)).blob() : null;
      void start({ image, text: detail.text ?? "" });
    };
    window.addEventListener("poold:share", onTest);
    return () => {
      cancelled = true;
      window.removeEventListener("poold:share", onTest);
    };
  }, [leagues, start]);

  /**
   * Paste the bet (picture and link together). With a link already here and
   * no picture yet, this is "add the screenshot": the link is kept and the
   * picture is read.
   */
  async function pasteInstead() {
    const addingPicture = phase === "review" && !picture;
    let shared: SharedTicket | null = null;
    const native = await readNativeClipboard().catch(() => null);
    if (native) {
      shared = { image: native.image, text: native.text };
    } else {
      try {
        const items = await navigator.clipboard.read();
        let image: Blob | null = null;
        let text = "";
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType && !image) image = await item.getType(imageType);
          if (item.types.includes("text/plain") && !text) text = await (await item.getType("text/plain")).text();
        }
        shared = { image, text };
      } catch {
        toast({ title: "Couldn't paste", description: "Tap Paste on the bubble that pops up.", tone: "error" });
        return;
      }
    }
    if (addingPicture) {
      if (!shared.image) {
        toast({
          title: "No screenshot on the clipboard",
          description: "Take a screenshot of the bet, tap it, then Copy — or choose it from your photos.",
        });
        return;
      }
      const link = parseShareLink(shared.text);
      void start({ image: shared.image, text: link.ok ? link.url : money.shareText });
      return;
    }
    if (!shared.image && !shared.text.trim()) {
      toast({ title: "Nothing to paste", description: "Copy the bet from your sportsbook first." });
      return;
    }
    void start(shared);
  }

  const photoInput = useRef<HTMLInputElement>(null);

  function toggle(slug: string) {
    setSelected((cur) => {
      const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
      try {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  async function post() {
    if (selected.length === 0) return;
    setPhase("posting");
    setError(null);
    setFailed([]);
    const payload = ticketPayload(book, money, legs);
    const bad: Array<{ name: string; why: string }> = [];
    const done: string[] = [];
    for (const slug of selected) {
      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      if (picture) form.append("image", picture.blob, "ticket.jpg");
      const r = await apiForm(`/api/leagues/${slug}/tickets`, form).catch(() => null);
      const name = leagues.find((l) => l.slug === slug)?.name ?? slug;
      if (r?.ok) done.push(slug);
      else bad.push({ name, why: r ? (apiError(r) ?? "Couldn't post") : "Couldn't reach the server" });
    }
    if (bad.length === 0) {
      toast({
        title: done.length > 1 ? `Posted to ${done.length} leagues` : "Ticket posted",
        tone: "success",
      });
      router.push(`/${done[0]}/tickets`);
      return;
    }
    // Posted where it could; keep the rest selected to try again.
    setSelected(bad.map((b) => leagues.find((l) => l.name === b.name)?.slug ?? "").filter(Boolean));
    setFailed(bad);
    setPhase("review");
  }

  const blocked = legs.length === 0 || legs.some((l) => l.issues.length > 0);
  const currency = leagues.find((l) => l.slug === selected[0])?.currency ?? leagues[0]?.currency ?? "USD";

  return (
    <div className="field-atmosphere min-h-dvh">
      <main className="mx-auto w-full max-w-lg px-4 pb-[max(7rem,calc(env(safe-area-inset-bottom)+6rem))] pt-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))]">
        <header className="flex items-center gap-2.5">
          <Link
            href="/"
            aria-label="Close"
            className={glassButton}
          >
            <X className="h-5 w-5" />
          </Link>
          <h1 className="flex-1 text-xl font-bold text-ink tracking-tight">Post a ticket</h1>
        </header>

        {leagues.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-ink-muted">
            None of your leagues has Tickets switched on. An admin can turn it on in league Settings.
          </p>
        ) : phase === "waiting" ? (
          <div className="mt-16 flex justify-center text-ink-faint">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
          </div>
        ) : phase === "empty" ? (
          <section className="mt-6 space-y-4 rounded-[1.4rem] bg-chalk shadow-card p-5 text-center">
            <p className="text-sm text-ink-muted">
              In your sportsbook, open the bet, tap <span className="font-semibold text-ink">Share</span> and pick{" "}
              <span className="font-semibold text-ink">Pool’d</span>. Or copy it there and paste it here.
            </p>
            <Button type="button" fullWidth onClick={() => void pasteInstead()}>
              <ClipboardPaste className="h-4 w-4" /> Paste the bet
            </Button>
          </section>
        ) : (
          <div className="mt-5 space-y-5">
            {/* The slip and what the read made of it */}
            <section className="flex items-center gap-3 rounded-[1.4rem] bg-chalk shadow-card p-3">
              {picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picture.url} alt="Your bet slip" className="h-20 w-14 shrink-0 rounded-md object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                {phase === "review" && !picture ? (
                  // A link-only share (Stake, some bet365 shares): add the
                  // screenshot and the legs are read for you; the link stays.
                  <div>
                    <p className="text-[15px] font-semibold text-ink">Add a screenshot of the bet</p>
                    <p className="mt-1 text-[13px] leading-snug text-ink-muted">
                      This link came without a picture. Screenshot the bet in your book, then copy it and tap{" "}
                      <span className="font-semibold text-ink">Paste screenshot</span>, or share the screenshot to
                      Pool’d. The legs are read for you and the link stays.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button type="button" size="sm" onClick={() => void pasteInstead()}>
                        <ClipboardPaste className="h-3.5 w-3.5" /> Paste screenshot
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="bg-ink/[0.06] shadow-none hover:bg-ink/10"
                        onClick={() => photoInput.current?.click()}
                      >
                        <ImagePlus className="h-3.5 w-3.5" /> From photos
                      </Button>
                    </div>
                    <input
                      ref={photoInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void start({ image: file, text: money.shareText });
                      }}
                    />
                    <p className="mt-2 text-[11px] text-ink-faint">Or fill in the legs below by hand.</p>
                  </div>
                ) : phase === "reading" ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Loader2 className="h-4 w-4 animate-spin text-ink-muted" aria-hidden /> Reading your ticket…
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <BookBadge book={book} />
                      <span className="text-[11px] text-ink-faint">
                        {reader === "claude"
                          ? "Read from your screenshot — check each leg"
                          : reader === "fixture"
                            ? "Sample read (reader off here)"
                            : "Add the legs below"}
                      </span>
                    </div>
                    {notes ? <p className="mt-1 text-[11px] text-warning">{notes}</p> : null}
                  </>
                )}
              </div>
            </section>

            {/* Where it goes */}
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink-muted">
                Post to
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-[1.4rem] bg-chalk shadow-card">
                {leagues.map((l) => {
                  const on = selected.includes(l.slug);
                  return (
                    <li key={l.slug}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(l.slug)}
                        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-field-deep"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition",
                            on ? "border-ink bg-ink text-on-ink" : "border-border-strong",
                          )}
                        >
                          {on ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                          {l.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {phase !== "reading" ? (
              <section className="space-y-4">
                <TicketFields
                  legs={legs}
                  onLegChange={(next) => setLegs((cur) => cur.map((l) => (l.key === next.key ? next : l)))}
                  onLegRemove={(key) => setLegs((cur) => cur.filter((l) => l.key !== key))}
                  onAddLeg={() => setLegs((cur) => [...cur, blankLeg(`leg-${++legSeq.current}`)])}
                  games={games}
                  money={money}
                  onMoney={(patch) => setMoney((cur) => ({ ...cur, ...patch }))}
                  currency={currency}
                />
              </section>
            ) : null}

            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {failed.length > 0 ? (
              <ul className="space-y-1 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                {failed.map((f) => (
                  <li key={f.name}>
                    <span className="font-semibold">{f.name}:</span> {f.why}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </main>

      {phase === "review" || phase === "posting" ? (
        <div className="fixed inset-x-0 bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)-0.625rem))] z-40 px-4">
          <div className="glass mx-auto max-w-lg rounded-[1.75rem] p-2">
            <Button
              type="button"
              fullWidth
              size="lg"
              disabled={phase === "posting" || blocked || selected.length === 0}
              onClick={() => void post()}
            >
              {phase === "posting"
                ? "Posting…"
                : selected.length === 0
                  ? "Pick a league to post to"
                  : selected.length === 1
                    ? `Post to ${leagues.find((l) => l.slug === selected[0])?.name ?? "league"}`
                    : `Post to ${selected.length} leagues`}
            </Button>
            {blocked && legs.length > 0 && phase === "review" ? (
              <p className="mt-1.5 pb-0.5 text-center text-[11px] text-ink-muted">Fill in the flagged legs to post.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
