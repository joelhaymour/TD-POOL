import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { apnsConfigured, webPushConfigured } from "@/lib/notify/push";

/** What this server can push to: browsers (Web Push) and/or the iPhone app (APNs). */
export async function GET() {
  return NextResponse.json({
    web: webPushConfigured(),
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    apns: apnsConfigured(),
  });
}

type Body = { kind?: string; endpoint?: string; keys?: { p256dh?: string; auth?: string }; token?: string };

/** Register this device: { kind: "web", endpoint, keys } or { kind: "apns", token }. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Body;
  const row =
    body.kind === "apns" && typeof body.token === "string" && /^[0-9a-f]{32,200}$/i.test(body.token)
      ? { kind: "apns", endpoint: body.token.toLowerCase(), p256dh: null, auth: null }
      : body.kind === "web" &&
          typeof body.endpoint === "string" &&
          body.endpoint.startsWith("https://") &&
          body.keys?.p256dh &&
          body.keys?.auth
        ? { kind: "web", endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth }
        : null;
  if (!row) return NextResponse.json({ error: "Not a push subscription", code: "VALIDATION" }, { status: 400 });
  // One row per device: signing in as someone else on the same phone moves it over.
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({ ...row, user_id: auth.user.id, last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Forget this device: { endpoint } or { token }. */
export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Body;
  const endpoint = body.endpoint ?? body.token?.toLowerCase();
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await createAdminClient().from("push_subscriptions").delete().eq("user_id", auth.user.id).eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
