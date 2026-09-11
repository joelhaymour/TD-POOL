import { getStore } from "@/lib/store";
import { requireViewerMembership } from "@/lib/auth/league";
import { TdLeaderboard } from "@/components/league/td-leaderboard";
import { GroupLeaderboard } from "@/components/betting/group-leaderboard";

export default async function LeaderboardPage({
  params,
}: PageProps<"/[slug]/leaderboard">) {
  const { slug } = await params;
  const member = await requireViewerMembership(slug);
  const league = await getStore().getLeagueBySlug(slug);
  if (league?.league_type === "group_betting") {
    return <GroupLeaderboard league={league} viewerMemberId={member.id} />;
  }
  return <TdLeaderboard />;
}
