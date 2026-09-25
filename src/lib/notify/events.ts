import { getStore } from "@/lib/store";
import { legShortTitle } from "@/lib/props/format";
import { followerIds } from "@/lib/social/follows";
import { formatAmerican, formatMoney } from "@/lib/utils/odds";
import type { League, LeagueMember, ParlayLeg, ParlayWithLegs } from "@/lib/types";
import { deliver, type Outgoing } from "./send";

type LeagueRef = Pick<League, "id" | "slug" | "name" | "currency">;

async function activeMembers(leagueId: string): Promise<LeagueMember[]> {
  return (await getStore().listMembers(leagueId)).filter((m) => m.active && m.user_id);
}

function money(amount: number | null | undefined, league: LeagueRef): string | null {
  return amount == null ? null : formatMoney(amount, league.currency);
}

/** "6-leg parlay at +2400, $20 pays $500" or "Cook anytime TD at -140". */
function describeTicket(t: ParlayWithLegs, league: LeagueRef): string {
  const what = t.legs.length === 1 ? legShortTitle(t.legs[0]) : `${t.legs.length}-leg parlay`;
  const odds = t.parlay.book_odds != null ? ` at ${formatAmerican(t.parlay.book_odds)}` : "";
  const stake = money(t.parlay.stake, league);
  const pays = money(t.parlay.book_payout, league);
  return `${what}${odds}${stake && pays ? `, ${stake} pays ${pays}` : ""}`;
}

// ---------- tickets ----------

export async function notifyTicketPosted(league: LeagueRef, ticket: ParlayWithLegs, poster: LeagueMember) {
  const members = await activeMembers(league.id);
  const body = `${poster.display_name} posted a ${describeTicket(ticket, league)}.`;
  await deliver(
    members
      .filter((m) => m.id !== poster.id)
      .map((m) => ({
        userId: m.user_id!,
        kind: "ticket_posted" as const,
        leagueId: league.id,
        title: league.name,
        body,
        url: `/${league.slug}/tickets`,
        dedupeKey: `post:${ticket.parlay.id}`,
      })),
  );
}

export async function notifyRide(league: LeagueRef, ticket: ParlayWithLegs, rider: LeagueMember) {
  const members = await activeMembers(league.id);
  const poster = members.find((m) => m.id === ticket.parlay.created_by_member_id);
  if (!poster || poster.id === rider.id) return;
  const what = ticket.legs.length === 1 ? legShortTitle(ticket.legs[0]) : `${ticket.legs.length}-leg parlay`;
  await deliver([
    {
      userId: poster.user_id!,
      kind: "ticket_ride",
      leagueId: league.id,
      title: league.name,
      body: `${rider.display_name} is riding your ${what}.`,
      url: `/${league.slug}/tickets`,
      dedupeKey: `ride:${ticket.parlay.id}:${rider.id}`,
    },
  ]);
}

type Role = "poster" | "rider" | "follower";

/**
 * A ticket moved: a leg hit, or the whole thing was decided. Goes to the
 * poster, everyone riding and everyone following, each in their own words.
 */
export async function notifyTicketProgress(
  league: LeagueRef,
  ticket: Pick<ParlayWithLegs, "parlay" | "legs" | "rides">,
  event: { kind: "hit" } | { kind: "won"; payout: number | null } | { kind: "lost" },
) {
  const members = await activeMembers(league.id);
  const byId = new Map(members.map((m) => [m.id, m]));
  const poster = byId.get(ticket.parlay.created_by_member_id ?? "");
  const name = poster?.display_name ?? "A member";

  const roles = new Map<string, Role>();
  for (const id of await followerIds(ticket.parlay.id)) roles.set(id, "follower");
  for (const r of ticket.rides) roles.set(r.member_id, "rider");
  if (poster) roles.set(poster.id, "poster");

  const legs = ticket.legs;
  const hits = legs.filter((l) => l.result === "won").length;
  const counted = legs.filter((l) => l.result !== "void").length;
  const left = legs.filter((l) => l.result === "pending").length;
  const pays = money(ticket.parlay.book_payout, league);
  const missed = legs.find((l: ParlayLeg) => l.result === "lost");
  const missedText = missed ? `${legShortTitle(missed)} missed.` : "";

  function text(role: Role): string {
    if (event.kind === "hit") {
      const tail = left > 0 ? ` ${left} more${pays ? ` for ${pays}` : ""}.` : "";
      if (role === "poster") return `You're ${hits} for ${counted}.${tail}`;
      if (role === "rider") return `${name}'s ticket you're riding is ${hits} for ${counted}.${tail}`;
      return `${name} is ${hits} for ${counted} on the parlay.${tail}`;
    }
    if (event.kind === "won") {
      const amount = money(event.payout, league);
      if (role === "poster") return amount ? `You cashed! ${amount} on your ticket.` : "You cashed your ticket!";
      if (role === "rider") return amount ? `${name}'s ticket you rode won: ${amount}.` : `${name}'s ticket you rode won.`;
      return amount ? `${name} won ${amount}.` : `${name}'s ticket cashed.`;
    }
    if (role === "poster") return `Your ticket lost. ${missedText}`.trim();
    if (role === "rider") return `${name}'s ticket you rode lost. ${missedText}`.trim();
    return `${name}'s ticket lost. ${missedText}`.trim();
  }

  const dedupe =
    event.kind === "hit" ? `hits:${ticket.parlay.id}:${hits}` : `result:${ticket.parlay.id}`;
  const out: Outgoing[] = [];
  for (const [memberId, role] of roles) {
    const m = byId.get(memberId);
    if (!m?.user_id) continue;
    out.push({
      userId: m.user_id,
      kind: "ticket_updates",
      leagueId: league.id,
      title: league.name,
      body: text(role),
      url: `/${league.slug}/tickets${event.kind === "hit" ? "" : "/history"}`,
      dedupeKey: dedupe,
    });
  }
  await deliver(out);
}

// ---------- TD pool ----------

async function weekNumber(weekId: string): Promise<number | null> {
  const week = (await getStore().listWeeks()).find((w) => w.id === weekId);
  return week?.week ?? null;
}

/** Everyone has a pick in for the week: tell the league the slip is set. */
export async function maybeAllPicksIn(league: LeagueRef, weekId: string) {
  const store = getStore();
  const [members, picks] = await Promise.all([activeMembers(league.id), store.getPicksForWeek(league.id, weekId)]);
  if (members.length < 2) return;
  const picked = new Set(picks.map((p) => p.member_id));
  if (!members.every((m) => picked.has(m.id))) return;
  const n = await weekNumber(weekId);
  await deliver(
    members.map((m) => ({
      userId: m.user_id!,
      kind: "pool" as const,
      leagueId: league.id,
      title: league.name,
      body: `All the picks are in${n ? ` for Week ${n}` : ""}. View the slip.`,
      url: `/${league.slug}/pool/slip`,
      dedupeKey: `allin:${league.id}:${weekId}`,
    })),
  );
}

/** One ping per person every three hours, however many times it is pressed. */
const PING_WINDOW_MS = 3 * 60 * 60_000;

/** Nudge everyone who has not picked yet. Returns how many were reached. */
export async function pingMissingPicks(
  league: LeagueRef,
  weekId: string,
  sender: LeagueMember,
): Promise<{ missing: number; sent: number }> {
  const store = getStore();
  const [members, picks] = await Promise.all([activeMembers(league.id), store.getPicksForWeek(league.id, weekId)]);
  const picked = new Set(picks.map((p) => p.member_id));
  const missing = members.filter((m) => !picked.has(m.id) && m.id !== sender.id);
  const n = await weekNumber(weekId);
  const bucket = Math.floor(Date.now() / PING_WINDOW_MS);
  const sent = await deliver(
    missing.map((m) => ({
      userId: m.user_id!,
      kind: "pool" as const,
      leagueId: league.id,
      title: league.name,
      body: `${sender.display_name} is waiting on your TD pick${n ? ` for Week ${n}` : ""}.`,
      url: `/${league.slug}/pool`,
      dedupeKey: `ping:${weekId}:${bucket}`,
    })),
  );
  return { missing: missing.length, sent };
}

// ---------- members ----------

export async function notifyJoined(league: LeagueRef, member: LeagueMember) {
  const members = await activeMembers(league.id);
  await deliver(
    members
      .filter((m) => m.id !== member.id)
      .map((m) => ({
        userId: m.user_id!,
        kind: "member_joined" as const,
        leagueId: league.id,
        title: league.name,
        body: `${member.display_name} joined ${league.name}.`,
        url: `/${league.slug}`,
        dedupeKey: `join:${member.id}`,
      })),
  );
}
