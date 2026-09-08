import { NextResponse } from "next/server";
import { seedSupabaseFromLocalPayload } from "@/lib/store/seed-supabase";
import { storeErrorResponse } from "@/lib/api/store-error";

/**
 * Bootstrap helper: seed demo league into Supabase from mock payload.
 * Development only — in production this would let anyone drop a demo league
 * into the live project.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Seeding is disabled in production", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

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
