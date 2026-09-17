import { requireSectionAccess } from "@/lib/auth/league";
import { TdHistory } from "@/components/league/td-history";

export default async function PoolHistoryPage({
  params,
}: PageProps<"/[slug]/pool/history">) {
  const { slug } = await params;
  await requireSectionAccess(slug, "td_pool");
  return <TdHistory />;
}
