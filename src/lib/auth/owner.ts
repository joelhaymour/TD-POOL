/**
 * The person who runs Pool'd (not a league admin): the only one who may
 * spend odds credits on demand. The Odds API quota is shared by every league,
 * and anyone who creates a league is its admin, so the manual odds refresh
 * can't be a league-admin power.
 */
const APP_OWNER_EMAILS = new Set(["joelhaymour00@gmail.com"]);

export function isAppOwner(email: string | null | undefined): boolean {
  return Boolean(email && APP_OWNER_EMAILS.has(email.trim().toLowerCase()));
}
