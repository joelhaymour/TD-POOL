/**
 * The link a league shares in its group chat. With the PIN in it, opening the
 * link lands on the home screen with the join sheet filled in — one tap to
 * join (after signing up, for someone new). Regenerating the PIN retires every
 * link shared before.
 */
export function inviteLink(origin: string, slug: string, pin?: string | null): string {
  const params = new URLSearchParams({ join: slug });
  if (pin) params.set("pin", pin);
  return `${origin}/?${params.toString()}`;
}
