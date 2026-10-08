import Link from "next/link";
import { requireViewerMembership } from "@/lib/auth/league";
import { AdminTools } from "./admin-tools";

export default async function AdminPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const member = await requireViewerMembership(slug);

  if (member.role !== "admin") {
    return (
      <div className="space-y-3 rounded-[1.4rem] bg-chalk shadow-card p-6 text-center">
        <h2 className="text-[17px] font-semibold text-ink">
          Admins only
        </h2>
        <p className="text-sm text-ink-muted">
          Ask a league admin if you need a pick corrected or results refreshed.
        </p>
        <Link
          href={`/${slug}`}
          className="inline-block text-sm font-semibold text-ink underline underline-offset-2"
        >
          Back to the league
        </Link>
      </div>
    );
  }

  return <AdminTools slug={slug} viewerMemberId={member.id} />;
}
