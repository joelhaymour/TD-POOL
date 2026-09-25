import { after } from "next/server";
import { TicketFeed } from "@/components/tickets/ticket-feed";
import { requireSectionAccess } from "@/lib/auth/league";
import { refreshGroupLeague } from "@/lib/services/refresh-group-league";
import { getStore } from "@/lib/store";
import { feedTickets, loadTickets } from "@/lib/tickets/load";

export const maxDuration = 60;

/** Bets the league placed, posted from their slips and followed live. */
export default async function TicketsPage({
  params,
}: PageProps<"/[slug]/tickets">) {
  const { slug } = await params;
  const { member, league } = await requireSectionAccess(slug, "tickets");

  const store = getStore();
  const [{ tickets, games }, members] = await Promise.all([
    loadTickets(store, league, member.id),
    store.listMembers(league.id),
  ]);
  after(() => refreshGroupLeague(slug));

  return (
    <TicketFeed
      slug={slug}
      league={league}
      members={members.filter((m) => m.active)}
      initialTickets={feedTickets(tickets)}
      initialGames={games}
      viewer={{ memberId: member.id, isAdmin: member.role === "admin" }}
    />
  );
}
