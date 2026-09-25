import { createAdminClient } from "@/lib/supabase/admin";

/** Pin or unpin a league on the member's home screen (their own seat only). */
export async function setPinned(memberId: string, pinned: boolean): Promise<void> {
  const { error } = await createAdminClient()
    .from("league_members")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", memberId);
  if (error) throw error;
}
