// Change this version when updating the offline files.
const CACHE_PREFIX = `my-game-${self.registration.scope}-`;
const CACHE_NAME = `${CACHE_PREFIX}v5`;
const APP_FILES = [
  "./", "./index.html", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./images/tile_0121.png", "./sounds/playerhit.mp3"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(APP_FILES.map(path => new Request(path, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Network first so online players receive current game files.
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range") ||
      !request.url.startsWith(self.registration.scope)) return;
  // Keep large streamed audio outside the simple offline cache.
  if (!APP_FILES.some(path => new URL(path, self.registration.scope).href === request.url) &&
      request.mode !== "navigate") return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: "no-cache" });
      if (response.ok && response.status === 200) {
        try { await cache.put(request, response.clone()); }
        catch (error) { console.warn("[sw] cache write failed", request.url, error); }
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const home = await cache.match("./index.html");
        if (home) return home;
      }
      throw error;
    }
  })());
});
