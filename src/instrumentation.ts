export async function register() {
  const { assertEnvironment } = await import("../scripts/environment.mjs");
  assertEnvironment({
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_TD_POOL_ENV: process.env.NEXT_PUBLIC_TD_POOL_ENV,
  });
}
