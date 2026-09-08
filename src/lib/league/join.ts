/** Random 4-digit join PIN (1000–9999). */
export function generateJoinPin(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/** Accepts a bare slug, a pasted invite URL, or a slug with stray slashes. */
export function normalizeJoinSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "-");
}
