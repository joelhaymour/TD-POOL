"use client";

import { useEffect } from "react";

const RELOAD_FLAG = "td-pool-sw-reload";

/** Registers the minimal public/sw.js service worker once on the client. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "TD_POOL_SW_UPDATED") return;
      if (sessionStorage.getItem(RELOAD_FLAG) === "1") return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);

    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          void reg.update();
        })
        .catch(() => {
          // Ignore registration failures (unsupported origin, etc.)
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
