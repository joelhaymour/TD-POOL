import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiAdmin } from "@/lib/auth/api";
import type { MemberRole } from "@/lib/types";

type RoleBody = {
  role?: MemberRole;
};

/** Admin-only: hand commissioner rights to another member, or step down. */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; memberId: string }> },
) {
  try {
    const { slug, memberId } = await context.params;
    const access = await requireApiAdmin(slug);
    if (!access.ok) return access.response;

    const body = (await request.json().catch(() => ({}))) as RoleBody;
    if (body.role !== "admin" && body.role !== "member") {
      return NextResponse.json(
        { error: "role must be 'admin' or 'member'", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const store = getStore();
    const member = await store.setMemberRole(
      access.league.id,
      memberId,
      body.role,
    );

    return NextResponse.json({
      member: {
        id: member.id,
        display_name: member.display_name,
        role: member.role,
      },
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
