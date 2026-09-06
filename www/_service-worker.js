const CACHE_NAME = 'solusi-pos-v1';
const API_ORIGIN = 'https://store.kottykosmetik.com';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/cek-harga.html',
  '/label-harga.html',
  '/po-receiving.html',
  '/stock-opname.html',
  '/manifest.json',
  '/styles/bootstrap.css',
  '/styles/style.css',
  '/scripts/jquery.min.js',
  '/scripts/bootstrap.min.js',
  '/scripts/custom.js',
  '/scripts/barcode-scanner.js',
  '/fonts/css/all.css',
  '/fonts/css/solid.css',
  '/fonts/css/fontawesome-all.min.css',
  '/app/icons/icon-192x192.png',
  '/app/icons/icon-512x512.png',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for API calls
  if (url.origin === API_ORIGIN) {
    event.respondWith(
      fetch(request)
        .then((res) => res)
        .catch(() => new Response(JSON.stringify({ status: 'error', pesan: 'Tidak ada koneksi internet' }), {
          headers: { 'Content-Type': 'application/json' },
        }))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return res;
      });
    })
  );
});
