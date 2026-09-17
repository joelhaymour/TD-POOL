import Link from "next/link";
import { requireViewerMembership } from "@/lib/auth/league";
import { AdminTools } from "./admin-tools";

export default async function AdminPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const member = await requireViewerMembership(slug);

  if (member.role !== "admin") {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-chalk p-6 text-center shadow-card">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
          Admins only
        </h2>
        <p className="text-sm text-ink-muted">
          Ask a league admin if you need a pick corrected or results refreshed.
        </p>
        <Link
          href={`/${slug}`}
          className="inline-block text-sm font-bold text-turf hover:underline"
        >
          Back to the league
        </Link>
      </div>
    );
  }

  return <AdminTools slug={slug} viewerMemberId={member.id} />;
}
