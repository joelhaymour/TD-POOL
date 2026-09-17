import { notFound } from "next/navigation";
import { after } from "next/server";
import { getStore } from "@/lib/store";
import { requireSectionAccess } from "@/lib/auth/league";
import { loadGroupHome } from "@/lib/props/load-group-home";
import { refreshGroupLeague } from "@/lib/services/refresh-group-league";
import { ParlayBoard } from "@/components/betting/parlay-board";

/** Every parlay still in play, with its odds, payout and place-the-bet links. */
export default async function ParlaysPage({
  params,
}: PageProps<"/[slug]/group/parlays">) {
  const { slug } = await params;
  const { member, league } = await requireSectionAccess(slug, "group_bets");
  if (!league.active_week_id) notFound();

  const store = getStore();
  const [{ slips, games }, members, weeks] = await Promise.all([
    loadGroupHome(store, league, league.active_week_id),
    store.listMembers(league.id),
    store.listWeeks(),
  ]);
  after(() => refreshGroupLeague(slug));

  return (
    <ParlayBoard
      slug={slug}
      league={league}
      members={members.filter((m) => m.active)}
      weeks={weeks}
      initialSlips={slips}
      initialGames={games}
      viewer={{ memberId: member.id, isAdmin: member.role === "admin" }}
    />
  );
}
