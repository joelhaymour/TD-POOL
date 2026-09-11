// These are public project identifiers, not credentials.
export const PRODUCTION_SUPABASE_REF = "yzqdawphpjxarctbggxl";
export const STAGING_SUPABASE_REF = "lskwowovnnjdndkthrzm";
export const PRODUCTION_VERCEL_PROJECT = "prj_UyCh7wMx5KRaZOva2O2O1QIXOPHw";

/** Fail before a build or server can connect to the wrong database. */
export function assertEnvironment(env) {
  const trustedProduction =
    env.VERCEL === "1" &&
    env.VERCEL_ENV === "production" &&
    env.VERCEL_PROJECT_ID === PRODUCTION_VERCEL_PROJECT &&
    env.VERCEL_GIT_COMMIT_REF === "main";
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  let host;
  if (rawUrl) {
    try {
      host = new URL(rawUrl).hostname;
    } catch {
      throw new Error("Invalid Supabase URL. Use the v2 project's URL for testing.");
    }
  }

  if (host === `${PRODUCTION_SUPABASE_REF}.supabase.co` && !trustedProduction) {
    throw new Error("Production Supabase access is blocked outside the live main deployment. Use the v2 environment.");
  }
  if (env.TD_POOL_ENV === "staging") {
    if (host !== `${STAGING_SUPABASE_REF}.supabase.co` || env.USE_SUPABASE !== "true") {
      throw new Error("Staging must use the dedicated TD Pool V2 Supabase project.");
    }
    if (env.VERCEL_PROJECT_ID === PRODUCTION_VERCEL_PROJECT) {
      throw new Error("Staging cannot deploy in the live td-pool Vercel project.");
    }
    if (env.NEXT_PUBLIC_TD_POOL_ENV !== "staging") {
      throw new Error("Staging must display the test environment banner.");
    }
    if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Staging requires its own Supabase public and service-role keys.");
    }
    if (env.ENABLE_PAID_PROVIDERS !== "false" || env.ENABLE_CRON_JOBS !== "false") {
      throw new Error("Keep paid providers and scheduled jobs disabled in staging during setup.");
    }
    // Legacy Supabase JWTs include their project ref. Catch mixed-project keys
    // without printing credentials. New opaque keys are validated by Supabase.
    for (const name of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const key = env[name];
      if (key?.split(".").length === 3) {
        let payload;
        try {
          const encoded = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
          payload = JSON.parse(atob(encoded));
        } catch {
          throw new Error(`Invalid ${name}; use the v2 project's key.`);
        }
        if (payload.ref !== STAGING_SUPABASE_REF) {
          throw new Error(`${name} belongs to a different Supabase project.`);
        }
      }
    }
  }
}
