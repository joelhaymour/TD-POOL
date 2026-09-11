import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertEnvironment, STAGING_SUPABASE_REF } from "./environment.mjs";

process.loadEnvFile(".env.local");
assertEnvironment(process.env);
if (process.env.TD_POOL_ENV !== "staging") throw new Error("This script is for staging only.");
const base = process.env.V2_TEST_URL || "http://127.0.0.1:3002";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error("Use the local v2 server for setup.");
const url = `https://${STAGING_SUPABASE_REF}.supabase.co`;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
mkdirSync(".data", { recursive: true, mode: 0o700 });
const path = ".data/v2-test-accounts.json";
const accounts = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [
  { email: "admin@td-pool-v2.test", name: "V2 Admin", password: randomBytes(18).toString("base64url") },
  { email: "member@td-pool-v2.test", name: "V2 Member", password: randomBytes(18).toString("base64url") },
  { email: "outsider@td-pool-v2.test", name: "V2 Outsider", password: randomBytes(18).toString("base64url") },
];
writeFileSync(path, JSON.stringify(accounts, null, 2), { mode: 0o600 });
const { data: listed, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw listError;
for (const account of accounts) {
  let user = listed.users.find(u => u.email === account.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true, user_metadata: { display_name: account.name } });
    if (error) throw error;
    user = data.user;
  }
  account.id = user.id;
}
writeFileSync(path, JSON.stringify(accounts, null, 2), { mode: 0o600 });

async function session(account) {
  const jar = new Map();
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { error } = await client.auth.signInWithPassword(account);
  if (error) throw error;
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
const cookies = await Promise.all(accounts.map(session));
async function request(path, index, body, method = "POST") {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(index == null ? {} : { Cookie: cookies[index] }) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) });
  const data = await response.json();
  return { status: response.status, data };
}
function expect(result, status, label) {
  if (result.status !== status) throw new Error(`${label}: expected ${status}, received ${result.status}: ${JSON.stringify(result.data)}`);
  console.log(`PASS ${label}`);
}
expect(await request("/api/leagues", null, { name: "No auth" }), 401, "anonymous league creation rejected");
for (const slug of ["v2-playground", "v2-second-league"]) {
  const { data: existing, error } = await admin.from("leagues").select("id").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!existing) {
    expect(await request("/api/leagues", 0, { name: slug === "v2-playground" ? "V2 Playground" : "V2 Second League", slug, admin_display_name: "V2 Admin", join_pin: "2468", betting_mode: "none", pick_lock_type: "individual_game" }), 201, `create ${slug}`);
  }
}
expect(await request("/api/leagues/v2-playground/join", 1, { displayName: "V2 Member", joinPin: "wrong" }), 403, "incorrect invitation PIN rejected");
expect(await request("/api/leagues/v2-playground/join", 1, { displayName: "V2 Member", joinPin: "2468" }), 201, "member joins playground");
expect(await request("/api/leagues/v2-playground", 2, undefined, "GET"), 403, "outsider cannot read private league");
expect(await request("/api/picks", 1, { leagueSlug: "v2-playground", playerId: "00000000-0000-0000-0000-000000000001", override: true, memberId: "00000000-0000-0000-0000-000000000001", weekId: "00000000-0000-0000-0000-000000000001" }), 403, "member cannot use admin pick override");
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const read = await anon.from("leagues").select("id");
if (!read.error) throw new Error("Anonymous league reads should be denied");
console.log("PASS anonymous database access denied");
const write = await anon.from("leagues").insert({ name: "Forbidden", slug: "forbidden-anonymous-test" });
if (!write.error) throw new Error("Anonymous database writes should be denied");
console.log("PASS anonymous database writes denied");
for (const endpoint of ["refresh-td-board", "refresh-goal-line"]) {
  const result = await request(`/api/cron/${endpoint}`, null, undefined, "GET");
  if (result.status !== 200 || !result.data.skipped) throw new Error("Staging cron was not skipped");
  console.log(`PASS ${endpoint} disabled`);
}
writeFileSync(".data/V2-TEST-ACCESS.md", `# TD Pool V2 test access\n\nOnly for the isolated v2 database. No production accounts were copied.\n\nTest site: https://td-pool-v2.vercel.app\nLocal: ${base}\nLeague: /v2-playground\nJoin PIN: 2468\n\n${accounts.map(a => `## ${a.name}\n\nEmail: ${a.email}\nPassword: ${a.password}\n`).join("\n")}\nThe outsider account is intentionally not a league member.\n`, { mode: 0o600 });
console.log("Test accounts and two leagues ready. Credentials saved privately in .data/V2-TEST-ACCESS.md.");
