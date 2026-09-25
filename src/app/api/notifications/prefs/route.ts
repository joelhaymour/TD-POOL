import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { prefsFromJson } from "@/lib/notify/kinds";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { data } = await createAdminClient()
    .from("notification_prefs")
    .select("prefs")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return NextResponse.json({ prefs: prefsFromJson(data?.prefs) });
}

export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const prefs = prefsFromJson(await request.json().catch(() => ({})));
  const { error } = await createAdminClient()
    .from("notification_prefs")
    .upsert({ user_id: auth.user.id, prefs, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs });
}
