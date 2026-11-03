// Offline support for the app's own files. Puzzle data is saved by the app itself (see js/book.js),
// and requests to GitHub are never cached here.
const CACHE = 'crosswords-app-v13';
const SHELL = ['./', './index.html', './css/app.css', './js/main.js', './js/book.js', './js/solver.js', './js/settings.js',
  './js/store.js', './js/ui.js', './js/keyboard.js', './js/themeicons.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/data/book.json')) return;
  e.respondWith(
    // Revalidate with the server each time (cheap with ETags), so a new version arrives at once, not after the HTTP cache expires
    fetch(e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' })).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
