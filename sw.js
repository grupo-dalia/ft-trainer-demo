const CACHE_VERSION = "ft-trainer-pwa-v31";
const CORE_ASSETS = ["/", "/index.html", "/cliente.html", "/pendiente.html", "/manifest.webmanifest", "/assets/pwa/ft-icon-192.png", "/assets/pwa/ft-icon-512.png", "/assets/brand/ft-symbol-color.png", "/assets/brand/ft-horizontal-color.png", "/portal.css?v=10", "/client-home.css?v=7", "/client-training-v2.css?v=7", "/client-hevy-ui.css?v=3", "/client-materials.css?v=1", "/client-hall-of-fame.css?v=1", "/client-premium.css?v=7", "/gym-trainer-fix.css?v=6", "/assets/brand/ft-horizontal-white.png", "/assets/fonts/clean-sports.otf", "/assets/fonts/sporter.ttf", "/pwa-safe-area.css?v=1", "/pwa.css?v=1", "/pwa.js?v=3", "/cliente.js?v=40", "/cliente-base.js?v=3", "/client-home.js?v=9", "/client-sections.js?v=29", "/exercise-media.js?v=1", "/client-materials.js?v=2", "/client-hall-of-fame.js?v=2", "/client-navigation-fix.js?v=3", "/vendor/supabase-js.min.js", "/supabase-config.js?v=2"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("ft-trainer-pwa-") && key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => { const copy = response.clone(); caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)); return response; }).catch(async () => (await caches.match(request)) || (await caches.match("/cliente.html")) || caches.match("/index.html")));
    return;
  }
  if (["script", "style"].includes(request.destination)) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)); }
      return response;
    }).catch(() => caches.match(request)));
    return;
  }
  if (["image", "font"].includes(request.destination)) event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)); } return response; })));
});
