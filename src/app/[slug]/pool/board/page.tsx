import { requireSectionAccess } from "@/lib/auth/league";
import { TdLeaderboard } from "@/components/league/td-leaderboard";

export default async function PoolBoardPage({
  params,
}: PageProps<"/[slug]/pool/board">) {
  const { slug } = await params;
  const { member } = await requireSectionAccess(slug, "td_pool");
  return <TdLeaderboard viewerMemberId={member.id} />;
}
