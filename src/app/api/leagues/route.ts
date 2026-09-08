import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiUser } from "@/lib/auth/api";
import type { CreateLeagueInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as Partial<CreateLeagueInput>;

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "League name is required", code: "VALIDATION" },
        { status: 400 },
      );
    }
    if (!body.admin_display_name?.trim()) {
      return NextResponse.json(
        { error: "Admin display name is required", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const store = getStore();
    const league = await store.createLeague({
      name: body.name.trim(),
      slug: body.slug,
      admin_display_name: body.admin_display_name.trim(),
      admin_user_id: auth.user.id,
      admin_pin: body.admin_pin ?? "1234",
      join_pin: body.join_pin ?? "0000",
      currency: body.currency,
      betting_mode: body.betting_mode,
      contribution_per_member: body.contribution_per_member,
      fixed_weekly_stake: body.fixed_weekly_stake,
      pick_lock_type: body.pick_lock_type,
      pick_deadline_at: body.pick_deadline_at,
      allow_pick_changes: body.allow_pick_changes,
      odds_format: body.odds_format,
      survivor_mode: body.survivor_mode,
      member_names: body.member_names,
      member_count: body.member_count,
      logo_url: body.logo_url,
    });

    // Kick off week board build in background — first dashboard open finishes it.
    void import("@/lib/services/align-league-week")
      .then(({ alignLeagueActiveWeek }) => alignLeagueActiveWeek(store, league))
      .catch((err) => console.error("createLeague materialize failed", err));

    const members = await store.listMembers(league.id);
    const admin =
      members.find((m) => m.role === "admin") ??
      members.find(
        (m) =>
          m.display_name.toLowerCase() ===
          body.admin_display_name!.trim().toLowerCase(),
      );

    return NextResponse.json(
      {
        ...league,
        admin_member_id: admin?.id ?? null,
      },
      { status: 201 },
    );
  } catch (err) {
    return storeErrorResponse(err);
  }
}
