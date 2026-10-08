/**
 * A bet link waiting for its screenshot. When a book shares only a link, the
 * member goes back to the bet, screenshots it and shares the picture to
 * Pool'd — and coming back opens the post screen from scratch. The link (and the
 * league they were posting to) is kept here meanwhile, and the picture picks
 * it up when it arrives. Half an hour, then it's stale.
 */
const KEY = "poold:pending-share";
const FRESH_MS = 30 * 60 * 1000;

export type PendingShare = { url: string; slug?: string; at: number };

export function rememberPendingShare(url: string, slug?: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ url, slug, at: Date.now() }));
  } catch {
    // No storage: the link just has to be pasted again.
  }
}

/** The waiting link, once: taking it clears it. */
export function takePendingShare(): PendingShare | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as Partial<PendingShare>;
    if (typeof pending.url !== "string" || typeof pending.at !== "number") return null;
    if (Date.now() - pending.at > FRESH_MS) return null;
    return { url: pending.url, slug: pending.slug, at: pending.at };
  } catch {
    return null;
  }
}
