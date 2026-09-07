import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";

type JoinBody = {
  displayName?: string;
  joinPin?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json()) as JoinBody;
    const store = getStore();

    const result = await store.joinLeague({
      slug,
      display_name: body.displayName ?? "",
      join_pin: body.joinPin ?? "",
    });

    return NextResponse.json(
      {
        league: {
          id: result.league.id,
          name: result.league.name,
          slug: result.league.slug,
        },
        member: {
          id: result.member.id,
          display_name: result.member.display_name,
          role: result.member.role,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return storeErrorResponse(err);
  }
}
