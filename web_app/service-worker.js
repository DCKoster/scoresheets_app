const CACHE_VERSION = 'scoresheets-shell-v8';

const APP_SHELL = [
  '/',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './src/main.js',
  './src/i18n.js',
  './src/data/games.js',
  './src/data/mario-kart.js',
  './src/utils/players.js',
  './src/state/repositories.js',
  './src/scoring/engines.js',
  './src/ui/navigation.js',
  './src/ui/home.js',
  './src/ui/history.js',
  './src/ui/statistics.js',
  './src/ui/game-manager.js',
  './src/ui/session-form.js',
  './src/ui/mario-kart.js',
];

self.addEventListener('install', (event) => {
  console.log('Service worker installing...');

  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activating...');

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Don't interfere with Google Fonts, browser extensions, etc.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation: serve the cached application shell.
  if (request.mode === 'navigate') {
  event.respondWith(
    caches.match('/').then((cached) => {
      return cached || fetch(request);
    })
    );

    return;
  }

  // Static resources: cache first, network fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        if (
          response.ok &&
          response.type === 'basic' &&
          !response.redirected
        ) {
          const copy = response.clone();

          event.waitUntil(
            caches
              .open(CACHE_VERSION)
              .then((cache) => cache.put(request, copy))
          );
        }

        return response;
      });
    })
  );
});
