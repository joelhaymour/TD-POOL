import { getStore } from "@/lib/store";
import { requireViewerMembership } from "@/lib/auth/league";
import { TdHistory } from "@/components/league/td-history";
import { GroupHistory } from "@/components/betting/group-history";

export default async function HistoryPage({
  params,
}: PageProps<"/[slug]/history">) {
  const { slug } = await params;
  const member = await requireViewerMembership(slug);
  const league = await getStore().getLeagueBySlug(slug);
  if (league?.league_type === "group_betting") {
    return <GroupHistory league={league} viewerMemberId={member.id} />;
  }
  return <TdHistory />;
}
