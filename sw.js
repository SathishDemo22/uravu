/* Uravu service worker: lets the app open with no internet.
   Change VERSION whenever you publish, so phones pick up the new files. */
const VERSION = 'uravu-2026-11-20-1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
const FONT_CACHE = 'uravu-fonts';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The page itself: try the network first (to get updates), fall back to the saved copy offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); }
      return res;
    }).catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }

  // Google Fonts: keep a copy once downloaded
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return url.hostname === 'fonts.gstatic.com' ? (hit || net) : (hit ? (net.catch(() => {}), hit) : net);
    })));
    return;
  }

  // Our own files (icons, manifest): saved copy first, refreshed in the background
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
      return hit ? (net.catch(() => {}), hit) : net;
    })));
  }
});
