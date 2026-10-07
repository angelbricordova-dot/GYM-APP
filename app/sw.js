// Service worker: la app abre sin internet.
// Red primero con caché de respaldo: con señal siempre ves la última versión; sin señal, la última guardada.
// La API (/api) nunca se cachea aquí: los datos viven en el teléfono (localStorage / IndexedDB).
const CACHE = 'lindwyrm-v6';
const SHELL = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest', '/vendor/preact-htm.js',
  '/js/main.js', '/js/store.js', '/js/logic.js', '/js/photos.js', '/js/theme.js', '/js/google.js', '/js/push.js', '/js/invite.js',
  '/js/ui/kit.js', '/js/ui/nav.js', '/js/ui/app.js', '/js/ui/auth.js', '/js/ui/google-button.js', '/js/ui/today.js', '/js/ui/train.js', '/js/ui/progress.js',
  '/js/ui/together.js', '/js/ui/challenges.js', '/js/ui/routines.js', '/js/ui/supplements.js', '/js/ui/skip.js', '/js/ui/cropper.js', '/js/ui/link.js', '/js/ui/rewards.js', '/js/ui/workout.js', '/js/ui/checkin.js', '/js/ui/profile.js', '/js/ui/calendar.js',
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

// ---------- notificaciones push ----------
// Siempre se muestra algo al recibir un push (iOS revoca la suscripción si no).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Lindwyrm', {
    body: d.body || '', icon: d.icon || '/icons/icon-192.png', badge: d.badge || '/icons/icon-192.png',
    tag: d.tag || 'lindwyrm', renotify: true, data: { url: d.url || '/' },
  }));
});

// Al tocarla: enfoca la app si ya está abierta (y la lleva a la sección) o la abre.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin);
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { await w.focus(); w.postMessage({ type: 'nav', tab: url.searchParams.get('tab') }); return; }
    }
    await self.clients.openWindow(url.href);
  })());
});
