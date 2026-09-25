"use client";

import { useEffect } from "react";
import { isNativeApp, registerNativeToken } from "@/lib/push/client";

/**
 * In the iPhone app: keep this device's push token on file (it can change),
 * and open the right screen when a notification is tapped. Does nothing in a
 * browser.
 */
export function PushBootstrap() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let cleanup: (() => void) | undefined;
    void (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const handles = await Promise.all([
        PushNotifications.addListener("registration", (t) => void registerNativeToken(t.value)),
        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const url = (action.notification.data as { url?: unknown } | undefined)?.url;
          if (typeof url === "string" && url.startsWith("/")) window.location.href = url;
        }),
      ]);
      cleanup = () => handles.forEach((h) => void h.remove());
      if ((await PushNotifications.checkPermissions()).receive === "granted") {
        await PushNotifications.register();
      }
    })().catch(() => {});
    return () => cleanup?.();
  }, []);
  return null;
}
