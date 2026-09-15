import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client.
 * Prefers service role; falls back to anon key for invite-link MVP bootstrap.
 * Never import in client components.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: unmemoizedFetch },
  });
}

/**
 * Next.js memoizes identical GET fetches for a whole page request, work
 * scheduled with `after()` included. For a database client that means a row
 * read back after a write returns the old value: a background refresh that had
 * just moved a league to Week 2 kept syncing Week 1, and a sync slot could be
 * claimed off a stale read. Passing a signal opts a fetch out of memoization.
 */
const unmemoizedFetch: typeof fetch = (input, init) =>
  fetch(
    input,
    init?.signal ? init : { ...init, signal: new AbortController().signal },
  );
