const CACHE_NAME = "roshni-shell-v19";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./src/styles.css",
  "./src/styles/room.css?v=14",
  "./src/app.js?v=11",
  "./src/ui/sky-scene.js?v=5",
  "./src/ui/fireflies.js?v=4",
  "./src/storage.js",
  "./src/content.js",
  "./src/voice.js",
  "./src/soundscape.js",
  "./src/cloud.js",
  "./src/recording.js",
  "./src/media-store.js",
  "./src/poem-layers.js",
  "./src/capture.js",
  "./src/decorations.js",
  "./src/rituals.js",
  "./src/pwa.js",
  "./assets/desk-at-dusk.png",
  "./assets/roshni-icon.svg",
  "./assets/scrapbook/pressed-flower.svg",
  "./assets/scrapbook/leaf-sprig.svg",
  "./assets/scrapbook/ink-wash.svg",
  "./assets/scrapbook/washi-tape.svg",
  "./assets/scrapbook/moon-stamp.svg",
  "./assets/scrapbook/rain-lines.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && (url.pathname.includes("/assets/scrapbook/") || url.pathname.endsWith(".css") || url.pathname.endsWith(".js"))) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => event.request.mode === "navigate" ? caches.match("./offline.html") : Response.error())));
});
