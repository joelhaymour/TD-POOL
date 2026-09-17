import { TicketHistory } from "@/components/tickets/ticket-history";
import { requireSectionAccess } from "@/lib/auth/league";

export default async function TicketsHistoryPage({
  params,
}: PageProps<"/[slug]/tickets/history">) {
  const { slug } = await params;
  const { member, league } = await requireSectionAccess(slug, "tickets");
  return <TicketHistory league={league} viewerMemberId={member.id} />;
}
