const CACHE_VERSION = 'scoresheets-shell-v3';
const APP_SHELL = [
  './index.html', './styles.css', './manifest.webmanifest', './icons/icon.svg',
  './src/main.js', './src/i18n.js', './src/data/games.js', './src/utils/players.js',
  './src/state/repositories.js', './src/scoring/engines.js', './src/ui/navigation.js',
  './src/ui/home.js', './src/ui/history.js', './src/ui/statistics.js', './src/ui/game-manager.js', './src/ui/session-form.js',
];

self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activating...');
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  console.log('Service worker fetching', event.request.url);
  if (event.request.method !== 'GET') return;
  const request = event.request;
  if (request.mode === 'navigate') {
    console.log('Service worker handling navigation request for', request.url);
    event.respondWith(caches.match('./index.html').then((cached) => cached || fetch(request).catch(() => caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => {
    console.log('Service worker cache match for', request.url, cached ? 'HIT' : 'MISS');
    const update = fetch(request).then((response) => {
      console.log('Service worker fetched', request.url, 'with status', response.status);
      const sameOrigin = new URL(request.url).origin === self.location.origin;
      if (response.ok && response.type === 'basic' && !response.redirected && sameOrigin) {
        caches.open(CACHE_VERSION)
          .then((cache) => cache.put(request, response.clone()))
          .catch(() => { console.warn('Failed to update cache for', request.url); });
      }
      return response;
    });
    return cached || update;
  }));
});
