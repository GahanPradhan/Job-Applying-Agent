// JobPilot Service Worker — enables PWA install & share target
const CACHE_NAME = 'jobpilot-v1';
const ASSETS = [
  '/',
  '/css/style.css',
  '/js/app.js',
  '/add.html',
  '/manifest.json'
];

// Install — cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API calls, cache-first for static
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Don't cache API calls or share-target requests
  if (url.pathname.startsWith('/api') || url.pathname === '/share-target' || url.pathname === '/add') {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
