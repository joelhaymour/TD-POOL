import { createAdminClient } from "@/lib/supabase/admin";

/** Followers per ticket, and whether the viewer is one of them. */
export async function loadFollows(
  parlayIds: string[],
  viewerMemberId: string | null,
): Promise<Map<string, { count: number; mine: boolean }>> {
  const out = new Map<string, { count: number; mine: boolean }>();
  const unique = [...new Set(parlayIds.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("parlay_follows")
    .select("parlay_id, member_id")
    .in("parlay_id", unique);
  if (error) {
    console.error("follows load failed", error.message);
    return out;
  }
  for (const row of data ?? []) {
    const id = String(row.parlay_id);
    const cur = out.get(id) ?? { count: 0, mine: false };
    cur.count += 1;
    if (viewerMemberId && row.member_id === viewerMemberId) cur.mine = true;
    out.set(id, cur);
  }
  return out;
}

/** Member ids following a ticket. */
export async function followerIds(parlayId: string): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("parlay_follows")
    .select("member_id")
    .eq("parlay_id", parlayId);
  if (error) {
    console.error("followers load failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => String(r.member_id));
}

export async function setFollow(input: {
  parlayId: string;
  leagueId: string;
  memberId: string;
  following: boolean;
}): Promise<void> {
  const db = createAdminClient();
  if (!input.following) {
    const { error } = await db
      .from("parlay_follows")
      .delete()
      .eq("parlay_id", input.parlayId)
      .eq("member_id", input.memberId);
    if (error) throw error;
    return;
  }
  const { error } = await db.from("parlay_follows").upsert(
    { parlay_id: input.parlayId, league_id: input.leagueId, member_id: input.memberId },
    { onConflict: "parlay_id,member_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}
