import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { generateJoinPin } from "@/lib/league/join";

type InviteBody = {
  adminPin?: string;
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
    const body = (await request.json()) as InviteBody;
    const store = getStore();

    const league = await store.getLeagueBySlug(slug);
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (!body.adminPin || body.adminPin !== league.admin_pin) {
      return NextResponse.json(
        { error: "Invalid admin PIN", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

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
