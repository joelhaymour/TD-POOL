import test from "node:test";
import assert from "node:assert/strict";
import { assertEnvironment, PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF, PRODUCTION_VERCEL_PROJECT } from "./environment.mjs";

const staging = {
  TD_POOL_ENV: "staging", NEXT_PUBLIC_TD_POOL_ENV: "staging", USE_SUPABASE: "true",
  NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  ENABLE_PAID_PROVIDERS: "false", ENABLE_CRON_JOBS: "false",
};
const live = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT,
  VERCEL_GIT_COMMIT_REF: "main", NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
};
test("v2 can use only its isolated database", () => assert.doesNotThrow(() => assertEnvironment(staging)));
test("existing live main deployment remains permitted", () => assert.doesNotThrow(() => assertEnvironment(live)));
test("local production credentials are rejected even without a staging flag", () => {
  assert.throws(() => assertEnvironment({ NEXT_PUBLIC_SUPABASE_URL: live.NEXT_PUBLIC_SUPABASE_URL }), /Production Supabase/);
});
test("preview, v2, and other Vercel projects cannot use production", () => {
  for (const override of [{ VERCEL_ENV: "preview" }, { VERCEL_GIT_COMMIT_REF: "v2" }, { VERCEL_PROJECT_ID: "another-project" }]) {
    assert.throws(() => assertEnvironment({ ...live, ...override }), /Production Supabase/);
  }
});
test("staging rejects missing or unrelated database configuration", () => {
  for (const override of [{ NEXT_PUBLIC_SUPABASE_URL: "" }, { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }, { USE_SUPABASE: "false" }]) {
    assert.throws(() => assertEnvironment({ ...staging, ...override }), /dedicated/);
  }
});
test("staging cannot run inside the production Vercel project", () => {
  assert.throws(() => assertEnvironment({ ...staging, VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT }), /live td-pool/);
});
test("staging requires a visible label, credentials, and disabled paid services", () => {
  for (const name of ["NEXT_PUBLIC_TD_POOL_ENV", "SUPABASE_SERVICE_ROLE_KEY", "ENABLE_PAID_PROVIDERS", "ENABLE_CRON_JOBS"]) {
    assert.throws(() => assertEnvironment({ ...staging, [name]: "" }));
  }
});
test("mixed-project Supabase JWTs are rejected", () => {
  const key = `header.${Buffer.from(JSON.stringify({ ref: PRODUCTION_SUPABASE_REF })).toString("base64url")}.signature`;
  assert.throws(() => assertEnvironment({ ...staging, SUPABASE_SERVICE_ROLE_KEY: key }), /different Supabase project/);
});
test("malformed URLs fail without exposing their value", () => {
  assert.throws(() => assertEnvironment({ ...staging, NEXT_PUBLIC_SUPABASE_URL: "invalid" }), /Invalid Supabase URL/);
});
