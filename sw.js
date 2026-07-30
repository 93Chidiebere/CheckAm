const CACHE_NAME = 'checkam-v2'; // Bumped cache name to force service worker updates
const ASSETS = [
  '/',
  '/index.html',
  '/demo.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); // Force active service worker takeover
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of all pages immediately
});

self.addEventListener('fetch', (e) => {
  // Network-First strategy for document navigation to guarantee instant web updates
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-First for offline assets
    e.respondWith(
      caches.match(e.request).then((response) => {
        return response || fetch(e.request);
      })
    );
  }
});
