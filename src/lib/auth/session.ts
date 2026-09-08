import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user, or null. Cached per request so a layout, page and any
 * nested server component share one round-trip to Supabase.
 *
 * Always `getUser()` rather than `getSession()`: the former revalidates the JWT
 * with the auth server, while the latter trusts a cookie the client can forge.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
});

/** The signed-in user, redirecting to the login screen when there isn't one. */
export async function requireUser(returnTo?: string): Promise<User> {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login",
    );
  }
  return user;
}

/** Name to show for a user before they have picked a per-league display name. */
export function accountDisplayName(user: User): string {
  const meta = user.user_metadata as { display_name?: unknown } | null;
  const fromMeta =
    typeof meta?.display_name === "string" ? meta.display_name.trim() : "";
  if (fromMeta) return fromMeta;
  return user.email?.split("@")[0] ?? "Player";
}
