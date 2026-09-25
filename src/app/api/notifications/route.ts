import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

/** The signed-in person's inbox: newest 60, plus how many are unread. ?count=1 for just the count. */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
    .is("read_at", null);
  if (new URL(request.url).searchParams.get("count")) {
    return NextResponse.json({ unread: count ?? 0 });
  }
  const { data, error } = await db
    .from("notifications")
    .select("id, league_id, kind, title, body, url, created_at, read_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [], unread: count ?? 0 });
}

/** Mark read: { ids: [...] } for some, {} for everything. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  let q = createAdminClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", auth.user.id)
    .is("read_at", null);
  if (Array.isArray(body.ids)) q = q.in("id", body.ids.filter((v): v is string => typeof v === "string").slice(0, 200));
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
