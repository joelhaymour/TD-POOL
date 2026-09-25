"use client";

/**
 * Turning push on for this device. Three routes:
 *  - the iPhone app: the native plugin asks iOS, then hands its token over;
 *  - a browser (or Pool’d added to an iPhone home screen): Web Push;
 *  - iPhone Safari in a tab can't do either: it has to be added to the home screen.
 */
export type PushSupport = "native" | "web" | "ios-install" | "unsupported";

type Capacitorish = { isNativePlatform?: () => boolean };

export function isNativeApp(): boolean {
  const cap = (globalThis as { Capacitor?: Capacitorish }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function detectPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeApp()) return "native";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "web";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone ? "ios-install" : "unsupported";
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerNativeToken(token: string): Promise<void> {
  await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "apns", token }),
  });
}

/** Is push already on for this device? */
export async function pushIsOn(): Promise<boolean> {
  const support = detectPushSupport();
  if (support === "native") {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    return (await PushNotifications.checkPermissions()).receive === "granted";
  }
  if (support !== "web" || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

export async function enablePush(): Promise<{ ok: boolean; message?: string }> {
  const support = detectPushSupport();
  if (support === "native") {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      return { ok: false, message: "Notifications are off for Pool’d. Turn them on in Settings › Notifications › Pool’d." };
    }
    await PushNotifications.register(); // the token arrives via PushBootstrap's listener
    return { ok: true };
  }
  if (support === "ios-install") {
    return { ok: false, message: "On iPhone, add Pool’d to your Home Screen first (Share › Add to Home Screen), then turn notifications on from there." };
  }
  if (support !== "web") return { ok: false, message: "This browser can't show notifications." };

  const config = (await (await fetch("/api/push")).json()) as { web: boolean; vapidPublicKey: string | null };
  if (!config.web || !config.vapidPublicKey) {
    return { ok: false, message: "Push isn't switched on for this site yet. Your inbox still gets everything." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notifications are blocked for this site. Allow them in the browser's site settings." };
  }
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(config.vapidPublicKey) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "web", endpoint: json.endpoint, keys: json.keys }),
  });
  return res.ok ? { ok: true } : { ok: false, message: "Couldn't save this device. Try again." };
}

export async function disablePush(): Promise<void> {
  if (detectPushSupport() !== "web") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}
