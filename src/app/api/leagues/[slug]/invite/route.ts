import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiAdmin } from "@/lib/auth/api";
import { generateJoinPin } from "@/lib/league/join";

type InviteBody = {
  regenerate?: boolean;
};

/**
 * Admin-only: reveal join PIN (and optionally rotate it).
 * Public league GET intentionally strips join_pin.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiAdmin(slug);
    if (!access.ok) return access.response;

    const body = (await request.json().catch(() => ({}))) as InviteBody;
    const store = getStore();
    const league = access.league;

    let joinPin = league.join_pin;
    if (body.regenerate) {
      joinPin = generateJoinPin();
      await store.updateLeagueSettings(league.id, { join_pin: joinPin });
    }

    return NextResponse.json({
      slug: league.slug,
      name: league.name,
      join_pin: joinPin,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
