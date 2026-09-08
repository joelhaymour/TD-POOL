import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getStore } from "@/lib/store";
import type { League, LeagueMember } from "@/lib/types";

/**
 * Route-handler counterpart to `requireUser`. Returns a 401 response instead of
 * redirecting, since fetch callers want a status code rather than a login page.
 */
export async function requireApiUser(): Promise<
  { ok: true; user: User } | { ok: false; response: NextResponse }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { ok: true, user };
  } catch {
    // Fall through to the 401 below.
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: "Sign in to continue", code: "UNAUTHORIZED" },
      { status: 401 },
    ),
  };
}

/**
 * Guards league-scoped reads so knowing a slug is not enough to see someone
 * else's board, picks or standings.
 */
export async function requireApiMembership(
  slug: string,
): Promise<
  | { ok: true; user: User; league: League; member: LeagueMember }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth;

  const store = getStore();
  const league = await store.getLeagueBySlug(slug);
  if (!league) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      ),
    };
  }

  const member = await store.getMemberForUser(league.id, auth.user.id);
  if (!member) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user: auth.user, league, member };
}

/**
 * Guards commissioner actions. Admin is a property of the member row rather
 * than a shared PIN, so there is nothing to forward into a group chat.
 */
export async function requireApiAdmin(
  slug: string,
): Promise<
  | { ok: true; user: User; league: League; member: LeagueMember }
  | { ok: false; response: NextResponse }
> {
  const access = await requireApiMembership(slug);
  if (!access.ok) return access;

  if (access.member.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only league admins can do that", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }

  return access;
}
