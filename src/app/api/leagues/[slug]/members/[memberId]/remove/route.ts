import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";

type RemoveBody = {
  adminPin?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; memberId: string }> },
) {
  try {
    const { slug, memberId } = await context.params;
    const body = (await request.json()) as RemoveBody;
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

    const member = await store.setMemberActive(league.id, memberId, false);
    return NextResponse.json({
      member: {
        id: member.id,
        display_name: member.display_name,
        role: member.role,
        active: member.active,
      },
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
