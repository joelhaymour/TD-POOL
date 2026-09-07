/** localStorage key for “who am I” in a league (shared across join + dashboard). */
export function memberStorageKey(slug: string): string {
  return `tdpool:member:${slug}`;
}

/** Random 4-digit join PIN (1000–9999). */
export function generateJoinPin(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

export function normalizeJoinSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "-");
}
