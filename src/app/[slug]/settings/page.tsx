import { requireViewerMembership } from "@/lib/auth/league";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const member = await requireViewerMembership(slug);

  return <SettingsForm slug={slug} isAdmin={member.role === "admin"} />;
}
