// Service worker: la app abre sin internet.
// Red primero con caché de respaldo: con señal siempre ves la última versión; sin señal, la última guardada.
// La API (/api) nunca se cachea aquí: los datos viven en el teléfono (localStorage / IndexedDB).
const CACHE = 'lindwyrm-v1';
const SHELL = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest', '/vendor/preact-htm.js',
  '/js/main.js', '/js/store.js', '/js/logic.js', '/js/photos.js', '/js/theme.js', '/js/google.js',
  '/js/ui/kit.js', '/js/ui/nav.js', '/js/ui/app.js', '/js/ui/auth.js', '/js/ui/google-button.js', '/js/ui/today.js', '/js/ui/train.js', '/js/ui/progress.js',
  '/js/ui/together.js', '/js/ui/challenges.js', '/js/ui/rewards.js', '/js/ui/workout.js', '/js/ui/checkin.js', '/js/ui/profile.js', '/js/ui/calendar.js',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
  );
});
