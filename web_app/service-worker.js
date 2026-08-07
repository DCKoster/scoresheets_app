const CACHE_VERSION = 'scoresheets-shell-v3';
const APP_SHELL = [
  './index.html', './styles.css', './manifest.webmanifest', './icons/icon.svg',
  './src/main.js', './src/i18n.js', './src/data/games.js', './src/utils/players.js',
  './src/state/repositories.js', './src/scoring/engines.js', './src/ui/navigation.js',
  './src/ui/home.js', './src/ui/history.js', './src/ui/statistics.js', './src/ui/game-manager.js', './src/ui/session-form.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((cached) => cached || fetch(request).catch(() => caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => {
    const update = fetch(request).then((response) => {
      const sameOrigin = new URL(request.url).origin === self.location.origin;
      if (response.ok && response.type === 'basic' && !response.redirected && sameOrigin) {
        caches.open(CACHE_VERSION)
          .then((cache) => cache.put(request, response.clone()))
          .catch(() => { /* A cache update must not break the live response. */ });
      }
      return response;
    });
    return cached || update;
  }));
});
