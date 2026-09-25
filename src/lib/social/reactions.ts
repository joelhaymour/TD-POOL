import { createAdminClient } from "@/lib/supabase/admin";
import type { ReactionSummary } from "@/lib/types";

export type ReactionTarget = "ticket" | "pick";
const column = (t: ReactionTarget) => (t === "ticket" ? "parlay_id" : "pick_id");

export const EMPTY_REACTIONS: ReactionSummary = { up: 0, down: 0, mine: 0 };

/** Thumbs for a set of tickets or picks, with the viewer's own vote on each. */
export async function loadReactions(
  target: ReactionTarget,
  ids: string[],
  viewerMemberId: string | null,
): Promise<Map<string, ReactionSummary>> {
  const out = new Map<string, ReactionSummary>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const col = column(target);
  const { data, error } = await createAdminClient()
    .from("reactions")
    .select(`${col}, member_id, value`)
    .in(col, unique);
  if (error) {
    // Reactions are garnish: a missing table (before the migration) or a
    // hiccup must never take the page down with it.
    console.error("reactions load failed", error.message);
    return out;
  }
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row[col]);
    const cur = out.get(id) ?? { ...EMPTY_REACTIONS };
    const value = Number(row.value);
    if (value > 0) cur.up += 1;
    else if (value < 0) cur.down += 1;
    if (viewerMemberId && row.member_id === viewerMemberId) cur.mine = value > 0 ? 1 : -1;
    out.set(id, cur);
  }
  return out;
}

/** One vote per member per target; 0 takes the vote back. */
export async function setReaction(input: {
  leagueId: string;
  memberId: string;
  target: ReactionTarget;
  targetId: string;
  value: -1 | 0 | 1;
}): Promise<void> {
  const db = createAdminClient();
  const col = column(input.target);
  const { error: delErr } = await db
    .from("reactions")
    .delete()
    .eq("member_id", input.memberId)
    .eq(col, input.targetId);
  if (delErr) throw delErr;
  if (input.value === 0) return;
  const { error } = await db.from("reactions").insert({
    league_id: input.leagueId,
    member_id: input.memberId,
    [col]: input.targetId,
    value: input.value,
  });
  if (error) throw error;
}
