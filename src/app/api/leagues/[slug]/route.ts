import { NextResponse, after } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiAdmin, requireApiMembership } from "@/lib/auth/api";
import {
  loadLeagueDashboard,
  refreshLeagueData,
} from "@/lib/league/load-dashboard";
import { mergeSections, sectionsFromBody } from "@/lib/league/sections";
import { removeLeagueTicketImages } from "@/lib/tickets/storage";
import type { UpdateLeagueSettingsInput } from "@/lib/types";

/** First-run board materialize can exceed the default timeout. */
export const maxDuration = 300;

type PatchBody = UpdateLeagueSettingsInput;

export async function GET(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    const dashboard = await loadLeagueDashboard(slug);
    if (!dashboard) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // Provider refresh happens after the response is sent; each step is
    // throttled in `sync_state` so polling clients cannot stack up work.
    after(() => refreshLeagueData(slug));

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
    const access = await requireApiAdmin(slug);
    if (!access.ok) return access.response;

    const body = (await request.json()) as PatchBody;
    const store = getStore();
    const league = access.league;

    const {
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
      pick_mode,
      sections,
    } = body;

    const settings: UpdateLeagueSettingsInput = {};
    if (pick_mode !== undefined) {
      if (pick_mode !== "one_each" && pick_mode !== "open") {
        return NextResponse.json(
          { error: "pick_mode must be one_each or open", code: "VALIDATION" },
          { status: 400 },
        );
      }
      settings.pick_mode = pick_mode;
    }
    if (sections !== undefined) {
      const next = mergeSections(league.sections, sectionsFromBody(sections));
      if (
        !next.td_pool && !next.group_bets && !next.tickets
      ) {
        return NextResponse.json(
          { error: "Keep at least one section on", code: "VALIDATION" },
          { status: 400 },
        );
      }
      settings.sections = next;
    }
    if (name !== undefined) settings.name = name;
    if (currency !== undefined) settings.currency = currency;
    if (betting_mode !== undefined) {
      if (betting_mode !== "fixed" && betting_mode !== "none") {
        return NextResponse.json(
          { error: "betting_mode must be fixed or none", code: "VALIDATION" },
          { status: 400 },
        );
      }
      settings.betting_mode = betting_mode;
    }
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

/**
 * Admin: delete the league. Members, picks, slips, links and rides go with
 * it through the database; the ticket screenshots are cleared here because
 * storage does not cascade.
 */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/leagues/[slug]">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiAdmin(slug);
    if (!access.ok) return access.response;

    await removeLeagueTicketImages(access.league.id);
    await getStore().deleteLeague(access.league.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
