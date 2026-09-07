/* TD Pool — cache icons/manifest only; never cache-first Next JS/CSS (causes hydration mismatches). */
const CACHE = "td-pool-static-v2";
const PRECACHE = ["/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Only cache static brand assets — never HTML, API, or /_next bundles.
  const isAsset =
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname);

  if (!isAsset) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return cached ?? Response.error();
      }
    }),
  );
});
