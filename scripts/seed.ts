/**
 * Demo data for development, run from the command line. These used to be the
 * /api/seed and /api/seed-supabase routes; as scripts they never ship with the
 * deployed site.
 *
 *   npm run seed                 reset the local JSON store to the demo league
 *   npm run seed -- --supabase   seed the demo league into the Supabase project
 *                                in .env.local (the sandbox, never production)
 */
import { getLocalStore } from "../src/lib/store/local-store";
import { seedSupabaseFromLocalPayload } from "../src/lib/store/seed-supabase";

/** The live project. Seeding it would drop a demo league in front of real users. */
const PRODUCTION_PROJECT_REF = "yzqdawphpjxarctbggxl";

async function main() {
  if (process.argv.includes("--supabase")) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (run with --env-file=.env.local).");
    if (url.includes(PRODUCTION_PROJECT_REF)) {
      throw new Error("Refusing to seed the production Supabase project.");
    }
    const result = await seedSupabaseFromLocalPayload();
    console.log(`Supabase seeded: ${result.leagueName} (/${result.slug})`);
    return;
  }
  const result = await getLocalStore().reseed();
  console.log("Local store reseeded", result);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
