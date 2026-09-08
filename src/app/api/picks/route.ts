import { NextResponse } from "next/server";
import { getStore, type Store } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiUser } from "@/lib/auth/api";
import type { SelectPickInput } from "@/lib/types";

type PickBody = {
  leagueSlug?: string;
  playerId?: string;
  weekId?: string;
  /** Only honoured with `override` — the member an admin is picking for. */
  memberId?: string;
  /** When true with a valid adminPin, uses store.overridePick */
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
  const auth = await requireApiUser();
  if (!auth.ok) return auth;

  if (!body.leagueSlug || !body.playerId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "leagueSlug and playerId are required", code: "VALIDATION" },
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

  // An admin holding the PIN may pick on someone else's behalf; everyone else
  // picks as themselves, so the member id comes from the session rather than
  // the request body.
  let memberId: string;
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
    if (!body.memberId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "memberId is required to override", code: "VALIDATION" },
          { status: 400 },
        ),
      };
    }
    memberId = body.memberId;
  } else {
    const member = await store.getMemberForUser(league.id, auth.user.id);
    if (!member) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "You are not a member of this league", code: "FORBIDDEN" },
          { status: 403 },
        ),
      };
    }
    memberId = member.id;
  }

  return {
    ok: true,
    store,
    override: Boolean(body.override),
    input: {
      league_id: league.id,
      member_id: memberId,
      week_id: weekId,
      player_id: body.playerId,
    },
  };
}

/**
 * Locks a pick in. First pick of the week or a change to an existing one both
 * land here — the store distinguishes them, so callers do not have to know
 * which they are making.
 */
async function applyPick(request: Request) {
  const body = (await request.json()) as PickBody;
  const resolved = await resolvePickInput(body);
  if (!resolved.ok) return resolved.response;

  const { store, input, override } = resolved;
  if (override) {
    return NextResponse.json(await store.overridePick(input));
  }

  const existing = (
    await store.getPicksForWeek(input.league_id, input.week_id)
  ).find((pick) => pick.member_id === input.member_id);

  return existing
    ? NextResponse.json(await store.changePick(input))
    : NextResponse.json(await store.submitPick(input), { status: 201 });
}

export async function POST(request: Request) {
  try {
    return await applyPick(request);
  } catch (err) {
    return storeErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    return await applyPick(request);
  } catch (err) {
    return storeErrorResponse(err);
  }
}
