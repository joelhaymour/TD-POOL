/* TD Pool — self-updating SW.
 * v1 cached /_next/static (stale UI). v2+ only icons.
 * This build clears ALL caches and does not intercept app traffic.
 */
const CACHE = "td-pool-static-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
      // Notify open tabs to reload once so they drop any stale controller state.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({ type: "TD_POOL_SW_UPDATED", cache: CACHE });
      }
    })(),
  );
});

// Do not intercept fetches — always hit the network for HTML/JS/API.
