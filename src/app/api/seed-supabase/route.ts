import { NextResponse } from "next/server";
import { seedSupabaseFromLocalPayload } from "@/lib/store/seed-supabase";
import { storeErrorResponse } from "@/lib/api/store-error";

/**
 * Bootstrap helper: seed demo league into Supabase from mock payload.
 * Only enabled when USE_SUPABASE=true. Open for local/bootstrap; protect in prod.
 */
export async function POST() {
  if (process.env.USE_SUPABASE !== "true") {
    return NextResponse.json(
      {
        error: "Supabase seeding requires USE_SUPABASE=true",
        code: "FORBIDDEN",
      },
      { status: 403 },
    );
  }

  try {
    const result = await seedSupabaseFromLocalPayload();
    return NextResponse.json({
      ok: true,
      message: "Supabase store seeded",
      ...result,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
