import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { loadLeagueDashboard } from "@/lib/league/load-dashboard";
import type { UpdateLeagueSettingsInput } from "@/lib/types";

type PatchBody = UpdateLeagueSettingsInput & { admin_pin?: string };

export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]">,
) {
  try {
    const { slug } = await context.params;
    const dashboard = await loadLeagueDashboard(slug);
    if (!dashboard) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json(dashboard);
  } catch (err) {
    return storeErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]">,
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json()) as PatchBody;
    const store = getStore();

    const league = await store.getLeagueBySlug(slug);
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (!body.admin_pin || body.admin_pin !== league.admin_pin) {
      return NextResponse.json(
        { error: "Invalid admin PIN", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const {
      admin_pin: _pin,
      name,
      currency,
      betting_mode,
      contribution_per_member,
      fixed_weekly_stake,
      pick_lock_type,
      pick_deadline_at,
      allow_pick_changes,
      odds_format,
      survivor_mode,
      join_pin,
      logo_url,
      member_count,
      active_week_id,
    } = body;

    const settings: UpdateLeagueSettingsInput = {};
    if (name !== undefined) settings.name = name;
    if (currency !== undefined) settings.currency = currency;
    if (betting_mode !== undefined) settings.betting_mode = betting_mode;
    if (contribution_per_member !== undefined) {
      settings.contribution_per_member = contribution_per_member;
    }
    if (fixed_weekly_stake !== undefined) {
      settings.fixed_weekly_stake = fixed_weekly_stake;
    }
    if (pick_lock_type !== undefined) settings.pick_lock_type = pick_lock_type;
    if (pick_deadline_at !== undefined) {
      settings.pick_deadline_at = pick_deadline_at;
    }
    if (allow_pick_changes !== undefined) {
      settings.allow_pick_changes = allow_pick_changes;
    }
    if (odds_format !== undefined) settings.odds_format = odds_format;
    if (survivor_mode !== undefined) settings.survivor_mode = survivor_mode;
    if (join_pin !== undefined) settings.join_pin = join_pin;
    if (logo_url !== undefined) settings.logo_url = logo_url;
    if (member_count !== undefined) settings.member_count = member_count;
    if (active_week_id !== undefined) settings.active_week_id = active_week_id;

    const updated = await store.updateLeagueSettings(league.id, settings);
    return NextResponse.json(updated);
  } catch (err) {
    return storeErrorResponse(err);
  }
}
