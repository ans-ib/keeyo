'use strict';

// Keeyo service worker: app shell is cached for instant loads and offline use;
// the inventory (GET /api/data etc.) is network-first with a cached fallback so
// the register stays readable offline. Nothing else is intercepted.

const VERSION = 'keeyo-v1.3.0';

const SHELL = [
  '/',
  '/styles.css',
  '/app.js',
  '/models.js',
  '/aaguids.js',
  '/theme-init.js',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/vendor/qrcode.js',
  '/fonts/space-grotesk-500.woff2',
  '/fonts/space-grotesk-700.woff2',
  '/fonts/plex-mono-400.woff2',
  '/fonts/plex-mono-600.woff2',
];

const OFFLINE_API = ['/api/data', '/api/status', '/api/me'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (OFFLINE_API.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) return; // everything else API: network only

  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
