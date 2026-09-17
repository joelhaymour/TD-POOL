import { TicketLeaderboard } from "@/components/tickets/ticket-leaderboard";
import { requireSectionAccess } from "@/lib/auth/league";

export default async function TicketsBoardPage({
  params,
  searchParams,
}: PageProps<"/[slug]/tickets/board">) {
  const { slug } = await params;
  const { range } = await searchParams;
  const { member, league } = await requireSectionAccess(slug, "tickets");
  return (
    <TicketLeaderboard
      slug={slug}
      league={league}
      viewerMemberId={member.id}
      range={range === "season" ? "season" : "week"}
    />
  );
}
