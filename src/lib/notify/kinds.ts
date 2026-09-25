/**
 * The kinds of notification a person can switch on or off. Every event maps to
 * one of these; a missing preference means "on".
 */
export const NOTIFY_KINDS = {
  ticket_posted: {
    label: "New tickets",
    detail: "Someone in your league posts a bet.",
  },
  ticket_updates: {
    label: "Tickets you follow",
    detail: "Legs hitting and final results on tickets you posted, ride or follow.",
  },
  ticket_ride: {
    label: "Rides on your tickets",
    detail: "Someone rides a ticket you posted.",
  },
  pool: {
    label: "TD Pool",
    detail: "Pick reminders from your league, and when every pick is in.",
  },
  member_joined: {
    label: "New members",
    detail: "Someone joins one of your leagues.",
  },
} as const;

export type NotifyKind = keyof typeof NOTIFY_KINDS;
export type NotifyPrefs = Partial<Record<NotifyKind, boolean>>;
export const NOTIFY_KIND_KEYS = Object.keys(NOTIFY_KINDS) as NotifyKind[];

export function prefsFromJson(raw: unknown): NotifyPrefs {
  const out: NotifyPrefs = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of NOTIFY_KIND_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

export function wants(prefs: NotifyPrefs | undefined, kind: NotifyKind): boolean {
  return prefs?.[kind] !== false;
}
