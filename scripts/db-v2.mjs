import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { STAGING_SUPABASE_REF } from "./environment.mjs";

const mode = process.argv[2];
if (!["plan", "push", "status"].includes(mode)) throw new Error("Use plan, push, or status.");
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
if (!branch || branch === "main") throw new Error("Database testing requires v2 or a feature branch, never main.");
const linked = readFileSync("supabase/.temp/project-ref", "utf8").trim();
if (linked !== STAGING_SUPABASE_REF) throw new Error("Refusing database command: this checkout is not linked to TD Pool V2.");
process.loadEnvFile(".env.v2.setup.local");
const args = mode === "status"
  ? ["migration", "list", "--linked"]
  : ["db", "push", "--linked", ...(mode === "plan" ? ["--dry-run"] : ["--yes"])];
console.log(`Target: TD Pool V2 (${STAGING_SUPABASE_REF}); branch: ${branch}; action: ${mode}`);
const result = spawnSync("./node_modules/.bin/supabase", args, { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
