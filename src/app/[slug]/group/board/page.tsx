import { requireSectionAccess } from "@/lib/auth/league";
import { GroupLeaderboard } from "@/components/betting/group-leaderboard";

export default async function GroupBoardPage({
  params,
}: PageProps<"/[slug]/group/board">) {
  const { slug } = await params;
  const { member, league } = await requireSectionAccess(slug, "group_bets");
  return <GroupLeaderboard league={league} viewerMemberId={member.id} />;
}
