import { LeagueShell } from "@/components/layout/league-shell";

export default async function LeagueLayout({
  children,
  params,
}: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  return <LeagueShell slug={slug}>{children}</LeagueShell>;
}
