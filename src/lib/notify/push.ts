import { connect } from "node:http2";
import { createSign } from "node:crypto";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushMessage = { title: string; body: string; url: string; tag?: string };
type Subscription = { id: string; kind: "web" | "apns"; endpoint: string; p256dh: string | null; auth: string | null };

// ---------- Web Push (browsers, and Pool’d added to an iPhone home screen) ----------

export function webPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:joelhaymour00@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidReady = true;
}

async function sendWeb(sub: Subscription, msg: PushMessage): Promise<"ok" | "gone" | "error"> {
  if (!webPushConfigured() || !sub.p256dh || !sub.auth) return "error";
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(msg),
      { TTL: 60 * 60 * 6, urgency: "high" },
    );
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("web push failed", status, (err as Error).message);
    return "error";
  }
}

// ---------- APNs (the iPhone app) ----------
// Needs the key from the Apple Developer account: APNS_KEY_ID, APNS_TEAM_ID,
// APNS_PRIVATE_KEY (the .p8 file's text) and optionally APNS_BUNDLE_ID.

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}

let apnsJwt: { token: string; at: number } | null = null;
function apnsToken(): string {
  // Apple accepts a token for an hour and rejects a fresh one more often than every 20 minutes.
  if (apnsJwt && Date.now() - apnsJwt.at < 40 * 60_000) return apnsJwt.token;
  const b64 = (v: object | Buffer) =>
    (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString("base64url");
  const header = b64({ alg: "ES256", kid: process.env.APNS_KEY_ID });
  const claims = b64({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) });
  const key = process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const sig = createSign("SHA256").update(`${header}.${claims}`).sign({ key, dsaEncoding: "ieee-p1363" });
  apnsJwt = { token: `${header}.${claims}.${b64(sig)}`, at: Date.now() };
  return apnsJwt.token;
}

function apnsRequest(host: string, token: string, payload: string): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const client = connect(`https://${host}`);
    client.on("error", () => resolve({ status: 0, reason: "connect" }));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsToken()}`,
      "apns-topic": process.env.APNS_BUNDLE_ID || "com.joelhaymour.poold",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.setTimeout(8000, () => {
      req.close();
      resolve({ status: 0, reason: "timeout" });
    });
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      client.close();
      let reason: string | undefined;
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
      } catch {}
      resolve({ status, reason });
    });
    req.end(payload);
  });
}

async function sendApns(sub: Subscription, msg: PushMessage): Promise<"ok" | "gone" | "error"> {
  if (!apnsConfigured()) return "error";
  const payload = JSON.stringify({
    aps: { alert: { title: msg.title, body: msg.body }, sound: "default", "thread-id": msg.tag },
    url: msg.url,
  });
  // Xcode builds register with the sandbox gateway, TestFlight and App Store
  // builds with production; a token from the other one comes back BadDeviceToken.
  let res = await apnsRequest("api.push.apple.com", sub.endpoint, payload);
  if (res.status === 400 && res.reason === "BadDeviceToken") {
    res = await apnsRequest("api.sandbox.push.apple.com", sub.endpoint, payload);
  }
  if (res.status === 200) return "ok";
  if (res.status === 410 || res.reason === "Unregistered" || res.reason === "BadDeviceToken") return "gone";
  console.error("apns push failed", res.status, res.reason);
  return "error";
}

/** Push one message to every device a person has registered; drops dead ones. */
export async function pushToUsers(byUser: Map<string, PushMessage[]>): Promise<void> {
  const userIds = [...byUser.keys()];
  if (userIds.length === 0 || (!webPushConfigured() && !apnsConfigured())) return;
  const db = createAdminClient();
  const { data, error } = await db
    .from("push_subscriptions")
    .select("id, user_id, kind, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error || !data?.length) return;
  const gone: string[] = [];
  await Promise.all(
    data.flatMap((row) =>
      (byUser.get(String(row.user_id)) ?? []).map(async (msg) => {
        const sub = row as unknown as Subscription;
        const result = sub.kind === "apns" ? await sendApns(sub, msg) : await sendWeb(sub, msg);
        if (result === "gone") gone.push(sub.id);
      }),
    ),
  );
  if (gone.length > 0) await db.from("push_subscriptions").delete().in("id", [...new Set(gone)]);
}
