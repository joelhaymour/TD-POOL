import { after } from "next/server";
import { GroupBettingClient } from "@/components/betting/group-betting-client";
import { requireSectionAccess } from "@/lib/auth/league";
import { getStore } from "@/lib/store";
import { loadGroupHome } from "@/lib/props/load-group-home";
import { refreshGroupLeague } from "@/lib/services/refresh-group-league";

export const maxDuration = 300;

/** Build a shared parlay: pick a slip, add legs from the prop board. */
export default async function GroupCreatePage({
  params,
  searchParams,
}: PageProps<"/[slug]/group">) {
  const { slug } = await params;
  const { slip } = await searchParams;
  const { member, league } = await requireSectionAccess(slug, "group_bets");

  const store = getStore();
  const [weeks, members] = await Promise.all([
    store.listWeeks(),
    store.listMembers(league.id),
  ]);
  const week = weeks.find((w) => w.id === league.active_week_id) ?? null;
  const { slips, games } = week
    ? await loadGroupHome(store, league, week.id)
    : { slips: [], games: [] };
  after(() => refreshGroupLeague(slug));

  if (!week) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        This league&apos;s week isn&apos;t set up yet — check back in a moment.
      </p>
    );
  }

  return (
    <GroupBettingClient
      slug={slug}
      league={league}
      week={week}
      members={members.filter((m) => m.active)}
      initialSlips={slips}
      initialGames={games}
      initialSlipId={typeof slip === "string" ? slip : null}
      viewer={{ memberId: member.id, isAdmin: member.role === "admin" }}
    />
  );
}
