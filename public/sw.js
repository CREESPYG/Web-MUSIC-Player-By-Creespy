const CACHE_NAME = "creep-creep-m3-v4";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Exclude external APIs, audio streaming buffers, and YouTube iframes from service worker cache
  if (
    url.hostname.includes("youtube.com") ||
    url.hostname.includes("googlevideo.com") ||
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("spotify.com") ||
    url.hostname.includes("lrclib.net") ||
    url.pathname.startsWith("/api/") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  // ALWAYS Network-first for navigation/HTML documents to eliminate stale cached builds
  if (event.request.mode === "navigate" || event.request.destination === "document" || url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for hashed assets with fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
