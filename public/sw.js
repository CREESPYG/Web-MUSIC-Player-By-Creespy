const CACHE_NAME = "creep-creep-cache-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
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
  const request = event.request;

  // Exclude external APIs, audio streaming buffers, and YouTube iframes from service worker cache
  if (
    url.hostname.includes("youtube.com") ||
    url.hostname.includes("googlevideo.com") ||
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("spotify.com") ||
    request.method !== "GET"
  ) {
    return;
  }

  // Navigations: network-first so a fresh deploy shows immediately, with a
  // cached shell as the offline fallback (avoids serving stale HTML twice).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const network = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => {
                cache.put(request, response);
                cache.put("/", network);
              })
              .catch(() => {});
          }
          return response;
        })
        .catch(() => {
          return caches
            .match("/")
            .then((c) => c || caches.match("/index.html"));
        })
    );
    return;
  }

  // Same-origin assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return cached and fetch in background for update
        fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return response;
      });
    })
  );
});
