import { NextResponse } from "next/server";
import { StoreError } from "@/lib/store";

export function storeErrorResponse(err: unknown) {
  if (err instanceof StoreError) {
    const status =
      err.code === "NOT_FOUND"
        ? 404
        : err.code === "CONFLICT"
          ? 409
          : err.code === "FORBIDDEN" || err.code === "LOCKED"
            ? 403
            : 400;
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status },
    );
  }
  console.error(err);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
