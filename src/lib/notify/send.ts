import { createAdminClient } from "@/lib/supabase/admin";
import { prefsFromJson, wants, type NotifyKind, type NotifyPrefs } from "./kinds";
import { pushToUsers, type PushMessage } from "./push";

export type Outgoing = {
  userId: string;
  kind: NotifyKind;
  leagueId: string | null;
  title: string;
  body: string;
  url: string;
  /** Same key for the same person twice = delivered once. */
  dedupeKey?: string;
};

async function loadPrefs(userIds: string[]): Promise<Map<string, NotifyPrefs>> {
  const out = new Map<string, NotifyPrefs>();
  if (userIds.length === 0) return out;
  const { data } = await createAdminClient()
    .from("notification_prefs")
    .select("user_id, prefs")
    .in("user_id", userIds);
  for (const row of data ?? []) out.set(String(row.user_id), prefsFromJson(row.prefs));
  return out;
}

/**
 * Put each notification in its person's inbox (unless they switched that
 * kind off, or already have it) and push the new ones to their devices.
 * Never throws: a notification failing must not fail the action behind it.
 */
export async function deliver(items: Outgoing[]): Promise<number> {
  try {
    if (items.length === 0) return 0;
    const prefs = await loadPrefs([...new Set(items.map((i) => i.userId))]);
    const wanted = items.filter((i) => wants(prefs.get(i.userId), i.kind));
    if (wanted.length === 0) return 0;

    const { data, error } = await createAdminClient()
      .from("notifications")
      .upsert(
        wanted.map((i) => ({
          user_id: i.userId,
          league_id: i.leagueId,
          kind: i.kind,
          title: i.title,
          body: i.body,
          url: i.url,
          dedupe_key: i.dedupeKey ?? null,
        })),
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
      )
      .select("user_id, title, body, url, kind");
    if (error) {
      console.error("notification insert failed", error.message);
      return 0;
    }

    const byUser = new Map<string, PushMessage[]>();
    for (const row of data ?? []) {
      const list = byUser.get(String(row.user_id)) ?? [];
      list.push({ title: String(row.title), body: String(row.body), url: String(row.url ?? "/"), tag: String(row.kind) });
      byUser.set(String(row.user_id), list);
    }
    await pushToUsers(byUser).catch((err) => console.error("push failed", err));
    return data?.length ?? 0;
  } catch (err) {
    console.error("deliver failed", err);
    return 0;
  }
}
