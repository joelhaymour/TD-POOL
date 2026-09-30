"use client";

import { useState, type FormEvent } from "react";
import { Check, ClipboardPaste, Copy, ExternalLink, Link2, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { SHARE_BOOKS, sportsbook } from "@/lib/props/sportsbooks";
import { cn } from "@/lib/utils/cn";
import type { LeagueMember, ParlayShareLink } from "@/lib/types";

/** The book's own wordmark, on its own colour. */
function BookButton({
  share,
  who,
}: {
  share: ParlayShareLink;
  who: string | null;
}) {
  const book = sportsbook(share.sportsbook);
  const name = book?.name ?? share.sportsbook;
  return (
    <a
      href={share.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 font-display text-sm font-extrabold tracking-wide shadow-sm ring-1 ring-inset ring-white/20 transition active:scale-[0.98]"
      style={{
        backgroundColor: book?.brand.bg ?? "#333333",
        color: book?.brand.fg ?? "#FFFFFF",
      }}
      title={who ? `Shared by ${who}` : undefined}
    >
      <ExternalLink className="h-4 w-4" aria-hidden />
      Ride on {name}
    </a>
  );
}

/**
 * Sportsbooks mint share links on their own servers, so the member who placed
 * the slip pastes theirs and everyone else opens it to load the same
 * selections. Several books can sit side by side — one per member per book.
 */
export function RideBet({
  shares,
  members,
  viewerMemberId,
  isAdmin,
  disabled,
  canAdd = true,
  tone = "dark",
  onAdd,
  onRemove,
}: {
  shares: ParlayShareLink[];
  members: LeagueMember[];
  viewerMemberId: string;
  isAdmin: boolean;
  disabled?: boolean;
  /** False hides the paste prompt — a ticket's link belongs to its poster. */
  canAdd?: boolean;
  /** "dark" sits on the slip hero; "light" on the parlay tiles. */
  tone?: "dark" | "light";
  onAdd: (url: string, note: string) => Promise<boolean>;
  onRemove: (shareId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const dark = tone === "dark";

  async function copyLink(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard blocked; the link is still openable from the button.
    }
  }

  /**
   * A book's share sheet puts a picture of the bet on the clipboard beside
   * the link, and a text field ignores pictures — which reads as "nothing
   * pasted". Reading the clipboard's text directly gets the link every time.
   */
  async function pasteFromClipboard() {
    setPasteHint(null);
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        return;
      }
      setPasteHint(
        "The clipboard only held the picture of the bet — in the book's share sheet choose Copy link.",
      );
    } catch {
      setPasteHint("Couldn't read the clipboard. Long-press the box and paste instead.");
    }
  }

  const nameFor = (memberId: string) =>
    members.find((m) => m.id === memberId)?.display_name ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !url.trim()) return;
    setBusy(true);
    const ok = await onAdd(url.trim(), note.trim());
    setBusy(false);
    if (ok) {
      setUrl("");
      setNote("");
      setOpen(false);
    }
  }

  return (
    <div className={cn(dark && "mt-3 border-t border-raised-fg/10 pt-3")}>
      {shares.length > 0 ? (
        <>
          <p
            className={cn(
              "mb-2 text-[10px] font-bold uppercase tracking-[0.1em]",
              dark ? "text-raised-fg/50" : "text-ink-faint",
            )}
          >
            Ride this bet
          </p>
          <div className="flex flex-wrap gap-2">
            {shares.map((share) => (
              <div key={share.id} className="flex min-w-[45%] flex-1 items-center gap-1.5">
                <BookButton share={share} who={nameFor(share.member_id)} />
                <button
                  type="button"
                  className={cn(
                    "rounded-lg p-2 transition",
                    dark
                      ? "text-raised-fg/40 hover:text-raised-fg"
                      : "text-ink-faint hover:text-ink",
                  )}
                  aria-label="Copy this link"
                  onClick={() => void copyLink(share.id, share.url)}
                >
                  {copied === share.id ? (
                    <Check className="h-4 w-4 text-lime" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                </button>
                {share.member_id === viewerMemberId || isAdmin ? (
                  <button
                    type="button"
                    className={cn(
                      "rounded-lg p-2 transition hover:text-danger",
                      dark ? "text-raised-fg/40" : "text-ink-faint",
                    )}
                    aria-label="Remove this link"
                    onClick={() => void onRemove(share.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <ul className="mt-2 space-y-0.5">
            {shares.map((share) => {
              const who = nameFor(share.member_id);
              const book = sportsbook(share.sportsbook);
              return (
                <li
                  key={share.id}
                  className={cn(
                    "text-[11px]",
                    dark ? "text-raised-fg/55" : "text-ink-faint",
                  )}
                >
                  {book?.name ?? share.sportsbook} · {who ?? "a member"}
                  {share.note ? ` · ${share.note}` : ""}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {canAdd ? (
        <button
          type="button"
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[11px] font-medium underline-offset-2 transition hover:underline disabled:opacity-40",
            dark ? "text-raised-fg/55 hover:text-raised-fg" : "text-ink-muted hover:text-ink",
          )}
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          {shares.length > 0 ? "Add another share link" : "Placed it? Add your share link"}
        </button>
      ) : null}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Share your bet"
        description="Paste the share link from the book you placed it at. Everyone else gets a button that loads the same picks in their own account."
      >
        <form className="space-y-3 pb-2" onSubmit={submit}>
          {/* Text, not url: a share sheet pastes a sentence around the link,
              which a url field refuses to submit. The link is pulled out and
              checked against the known books server-side. */}
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={(e) => {
                // When the clipboard holds the book's picture AND the link,
                // the field takes neither. Pull the text out of the event.
                const text = e.clipboardData?.getData("text/plain")?.trim();
                if (text) {
                  e.preventDefault();
                  setUrl(text);
                  setPasteHint(null);
                }
              }}
              placeholder="https://..."
              className="min-w-0 flex-1 rounded-xl border border-border bg-field px-3 py-2.5 text-sm text-ink outline-none focus:border-turf"
            />
            <button
              type="button"
              onClick={() => void pasteFromClipboard()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border-strong px-3 text-xs font-bold uppercase tracking-wide text-ink-muted transition hover:text-ink"
            >
              <ClipboardPaste className="h-4 w-4" aria-hidden />
              Paste
            </button>
          </div>
          {pasteHint ? <p className="text-[11px] text-warning">{pasteHint}</p> : null}
          <input
            type="text"
            value={note}
            maxLength={140}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional) — e.g. $20 to win $340"
            className="w-full rounded-xl border border-border bg-field px-3 py-2.5 text-sm text-ink outline-none focus:border-turf"
          />
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="h-12 w-full rounded-full bg-lime pressable text-[15px] font-semibold text-accent-fg shadow-[0_6px_16px_-6px_rgba(17,128,60,0.55)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save link"}
          </button>
          <div className="rounded-xl border border-border bg-field p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              Where to find it
            </p>
            <ul className="mt-1.5 space-y-1">
              {SHARE_BOOKS.map((book) => (
                <li key={book.key} className="text-[11px] text-ink-faint">
                  <span className="font-semibold text-ink">{book.name}</span> ·{" "}
                  {book.shareHint}
                </li>
              ))}
            </ul>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
