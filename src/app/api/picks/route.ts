import { NextResponse } from "next/server";
import { getStore, type Store } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import type { SelectPickInput } from "@/lib/types";

type PickBody = {
  leagueSlug?: string;
  memberId?: string;
  playerId?: string;
  weekId?: string;
  /** When true with valid adminPin, uses store.overridePick */
  override?: boolean;
  adminPin?: string;
};

async function resolvePickInput(
  body: PickBody,
): Promise<
  | {
      ok: true;
      store: Store;
      input: SelectPickInput;
      override: boolean;
    }
  | { ok: false; response: NextResponse }
> {
  if (!body.leagueSlug || !body.memberId || !body.playerId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "leagueSlug, memberId, and playerId are required",
          code: "VALIDATION",
        },
        { status: 400 },
      ),
    };
  }

  const store = getStore();
  const league = await store.getLeagueBySlug(body.leagueSlug);
  if (!league) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      ),
    };
  }

  const weekId = body.weekId ?? league.active_week_id;
  if (!weekId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "League has no active week", code: "VALIDATION" },
        { status: 400 },
      ),
    };
  }

  if (body.override) {
    if (!body.adminPin || body.adminPin !== league.admin_pin) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Invalid admin PIN", code: "FORBIDDEN" },
          { status: 403 },
        ),
      };
    }
  }

  return {
    ok: true,
    store,
    override: Boolean(body.override),
    input: {
      league_id: league.id,
      member_id: body.memberId,
      week_id: weekId,
      player_id: body.playerId,
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PickBody;
    const resolved = await resolvePickInput(body);
    if (!resolved.ok) return resolved.response;

    const pick = resolved.override
      ? await resolved.store.overridePick(resolved.input)
      : await resolved.store.submitPick(resolved.input);
    return NextResponse.json(pick, { status: 201 });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as PickBody;
    const resolved = await resolvePickInput(body);
    if (!resolved.ok) return resolved.response;

    const pick = await resolved.store.changePick(resolved.input);
    return NextResponse.json(pick);
  } catch (err) {
    return storeErrorResponse(err);
  }
}
