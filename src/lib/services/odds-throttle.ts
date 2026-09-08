/** Odds sync throttle state — kept separate to avoid circular imports. */

const lastOddsSyncAt = new Map<string, number>();

export function getLastOddsSyncAt(slug: string): number {
  return lastOddsSyncAt.get(slug) ?? 0;
}

export function setLastOddsSyncAt(slug: string, at: number): void {
  lastOddsSyncAt.set(slug, at);
}

export function invalidateOddsSyncThrottle(): void {
  lastOddsSyncAt.clear();
}
