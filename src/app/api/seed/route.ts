import { NextResponse } from "next/server";
import { getLocalStore } from "@/lib/store/local-store";
import { storeErrorResponse } from "@/lib/api/store-error";

/**
 * Dev helper: reset the local JSON store to the seed demo league.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Seeding is disabled in production", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const store = getLocalStore();
    const result = await store.reseed();
    return NextResponse.json({
      ok: true,
      message: "Store reseeded",
      ...result,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
