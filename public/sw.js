const VERSION = 'keeyo-v2.0.0';

const SHELL = [
  '/',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/fonts/plex-mono-400.woff2',
  '/fonts/plex-mono-600.woff2',
  '/css/fonts.css',
  '/css/tokens.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/overlays.css',
  '/css/keys.css',
  '/css/services.css',
  '/css/settings.css',
  '/css/auth.css',
  '/css/scan.css',
  '/css/print.css',
  '/css/motion.css',
  '/js/theme-init.js',
  '/js/vendor/qrcode.js',
  '/js/catalog.js',
  '/js/data/aaguids.js',
  '/js/data/models.js',
  '/js/forms/identify.js',
  '/js/forms/key-form.js',
  '/js/forms/registration-form.js',
  '/js/forms/service-form.js',
  '/js/icons.js',
  '/js/lib/api.js',
  '/js/lib/dom.js',
  '/js/lib/secret-notes.js',
  '/js/lib/webauthn.js',
  '/js/main.js',
  '/js/print-export.js',
  '/js/router.js',
  '/js/state.js',
  '/js/theme.js',
  '/js/ui/copy-field.js',
  '/js/ui/forms.js',
  '/js/ui/key-art.js',
  '/js/ui/modal.js',
  '/js/ui/rows.js',
  '/js/ui/service-icon.js',
  '/js/ui/shell.js',
  '/js/ui/toast.js',
  '/js/ui/undo.js',
  '/js/views/auth.js',
  '/js/views/key-detail.js',
  '/js/views/keys.js',
  '/js/views/services.js',
  '/js/views/settings-catalog.js',
  '/js/views/settings-security.js',
  '/js/views/settings-tokens.js',
  '/js/views/settings.js',
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
  if (url.pathname.startsWith('/api/') && !OFFLINE_API.includes(url.pathname)) return;

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
});
