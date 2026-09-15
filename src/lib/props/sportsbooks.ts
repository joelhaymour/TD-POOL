/**
 * The books this app knows about.
 *
 * Adding one is a single entry here: the share-link parser, the branded
 * button, and the API validation all read from this list. A book only needs
 * `deepLink: true` if we can build a prefilled slip for it ourselves —
 * everything else still works through a share link the bettor pastes.
 */
export type SportsbookKey = "fanduel" | "bet365" | "draftkings" | "betmgm";

export type SportsbookDef = {
  key: SportsbookKey;
  /** Wordmark as the book writes it — bet365 is lowercase on purpose. */
  name: string;
  /** Button background and the text colour that stays readable on it. */
  brand: { bg: string; fg: string };
  /** Host suffixes a share link from this book can use. */
  hosts: string[];
  /** We can build a prefilled slip from our own board (no share link needed). */
  deepLink: boolean;
  /** Shown in the paste sheet: how to get the link out of the app. */
  shareHint: string;
};

export const SPORTSBOOKS: SportsbookDef[] = [
  {
    key: "fanduel",
    name: "FanDuel",
    brand: { bg: "#1493FF", fg: "#FFFFFF" },
    hosts: ["fanduel.com"],
    deepLink: true,
    shareHint: "Open the bet, tap the share icon, then Copy link.",
  },
  {
    key: "bet365",
    name: "bet365",
    brand: { bg: "#027B5B", fg: "#FFFFFF" },
    hosts: ["bet365.com"],
    deepLink: false,
    shareHint: "Open the bet in My Bets, tap Share Bet, then copy the link.",
  },
  {
    key: "draftkings",
    name: "DraftKings",
    brand: { bg: "#61C250", fg: "#0B0B0B" },
    hosts: ["draftkings.com", "dksb.sng.link", "dkn.gs"],
    deepLink: false,
    shareHint: "Open the bet, tap Share, then copy the link.",
  },
  {
    key: "betmgm",
    name: "BetMGM",
    brand: { bg: "#C8A15A", fg: "#0B0B0B" },
    hosts: ["betmgm.com"],
    deepLink: false,
    shareHint: "Open the bet, tap Share, then copy the link.",
  },
];

const BY_KEY = new Map(SPORTSBOOKS.map((b) => [b.key, b]));

export function sportsbook(key: string): SportsbookDef | null {
  return BY_KEY.get(key as SportsbookKey) ?? null;
}

export function sportsbookName(key: string): string {
  return BY_KEY.get(key as SportsbookKey)?.name ?? key;
}

/** Every book we accept a share link from, in button order. */
export const SHARE_BOOKS = SPORTSBOOKS;

export type ShareLinkParse =
  | { ok: true; sportsbook: SportsbookKey; url: string }
  | { ok: false; error: string };

/**
 * Work out which book a pasted share link belongs to.
 *
 * Share sheets paste a sentence around the URL ("Check out my bet: https://…"),
 * so the first link in the text is used. The host has to match a known book:
 * these links become buttons other members tap, and an open text field would
 * make the slip a place to post any link at all.
 */
export function parseShareLink(raw: string): ShareLinkParse {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, error: "Paste the link first" };

  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) {
    return { ok: false, error: "That doesn't look like a link" };
  }

  let url: URL;
  try {
    url = new URL(match[0]);
  } catch {
    return { ok: false, error: "That doesn't look like a link" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "Only https links are allowed" };
  }
  // A link carrying credentials is never a real share link.
  if (url.username || url.password) {
    return { ok: false, error: "That link can't be used here" };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const book = SHARE_BOOKS.find(
    (b) =>
      b.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
  );
  if (!book) {
    const names = SHARE_BOOKS.map((b) => b.name).join(", ");
    return { ok: false, error: `Share links are supported for ${names}` };
  }

  // Trailing junk from a paste (quotes, a stray paren) would 404 at the book.
  url.hash = url.hash.replace(/[)\]"']+$/, "");
  return { ok: true, sportsbook: book.key, url: url.toString() };
}
