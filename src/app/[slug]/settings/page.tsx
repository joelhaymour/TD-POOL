import { requireViewerMembership } from "@/lib/auth/league";
import { hiddenSections } from "@/lib/native/server";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const member = await requireViewerMembership(slug);

  return (
    <SettingsForm
      slug={slug}
      isAdmin={member.role === "admin"}
      hiddenSections={await hiddenSections()}
    />
  );
}
