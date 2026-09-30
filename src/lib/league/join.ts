/** Random 4-digit join PIN (1000–9999). */
export function generateJoinPin(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/** Accepts a bare slug, a pasted invite link, or a slug with stray slashes. */
export function normalizeJoinSlug(raw: string): string {
  const text = raw.trim();
  // An invite link: https://…/?join=<code>&pin=… (or the older https://…/<code>).
  const fromQuery = text.match(/[?&]join=([^&#\s]+)/);
  if (fromQuery) return decodeURIComponent(fromQuery[1]).toLowerCase();
  const fromUrl = text.match(/^https?:\/\/[^/]+\/([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : text)
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "-");
}

/** The PIN inside a pasted invite link, if it has one. */
export function pinFromInvite(raw: string): string | null {
  return raw.match(/[?&]pin=(\d{4,8})/)?.[1] ?? null;
}
