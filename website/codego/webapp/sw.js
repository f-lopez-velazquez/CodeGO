/* Cache only this app and pinned runtime libraries. Never cache auth API responses. */
const CACHE = 'codego-shell-v1.6.15-animated-examples-2';
const FILES = ['./', 'index.html', 'site.css', 'app.js', 'store.js', 'course.js', 'course-content.js', 'learning.js', 'example-traces.js', 'example-player.js', 'editor.js', 'codego-mark.svg', 'codego-sdk.js', 'execution-worker.js', 'firebase-config.js', 'icon.png', 'manifest.webmanifest', 'licenses/freeCodeCamp.txt'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('codego-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/__/')) return;
  const local = url.origin === location.origin;
  const runtime = url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/pyodide/v0.27.7/full/');
  const firebase = url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/12.7.0/');
  if (!local && !runtime && !firebase) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    // importScripts uses no-cors; fetch pinned CDN resources with CORS so the JS loader is cacheable too.
    const request = runtime || firebase ? new Request(event.request.url, { mode: 'cors', credentials: 'omit' }) : event.request;
    const response = await fetch(request);
    if (response.ok && (local || runtime || firebase)) {
      try { await cache.put(event.request, response.clone()); } catch (_) { /* Quota pressure must not break online execution. */ }
    }
    return response;
  }));
});
