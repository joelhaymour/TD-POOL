import { TicketLeaderboard } from "@/components/tickets/ticket-leaderboard";
import { requireSectionAccess } from "@/lib/auth/league";

export default async function TicketsBoardPage({
  params,
  searchParams,
}: PageProps<"/[slug]/tickets/board">) {
  const { slug } = await params;
  const { range, week } = await searchParams;
  const weekNumber = typeof week === "string" && /^\d{1,2}$/.test(week) ? Number(week) : undefined;
  const { member, league } = await requireSectionAccess(slug, "tickets");
  return (
    <TicketLeaderboard
      slug={slug}
      league={league}
      viewerMemberId={member.id}
      range={range === "season" ? "season" : "week"}
      weekNumber={weekNumber}
    />
  );
}
