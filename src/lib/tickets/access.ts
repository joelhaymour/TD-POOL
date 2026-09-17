import { NextResponse } from "next/server";
import type { League } from "@/lib/types";

/** Route guard: the tickets section has to be on for any of its endpoints. */
export function requireTickets(league: League): NextResponse | null {
  if (!league.sections.tickets) {
    return NextResponse.json(
      { error: "Tickets are switched off in this league", code: "FORBIDDEN" },
      { status: 403 },
    );
  }
  return null;
}
