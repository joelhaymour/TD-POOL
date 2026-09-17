import { requireSectionAccess } from "@/lib/auth/league";
import { GroupHistory } from "@/components/betting/group-history";

export default async function GroupHistoryPage({
  params,
}: PageProps<"/[slug]/group/history">) {
  const { slug } = await params;
  const { member, league } = await requireSectionAccess(slug, "group_bets");
  return <GroupHistory league={league} viewerMemberId={member.id} />;
}
