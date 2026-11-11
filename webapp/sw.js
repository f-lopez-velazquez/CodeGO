/* Cache only this app and pinned runtime libraries. Never cache auth API responses. */
importScripts('terminal-input-sw.js');
const CACHE = 'codego-shell-v1.6.19-interactive-stdin-2';
const RUNTIME_CACHE = 'codego-runtime-py0277-firebase1270';
const FILES = ['./', 'index.html', 'site.css', 'app.js', 'store.js', 'evidence.js', 'error-coach.js', 'error-coach.css', 'viewport-menu.js', 'viewport-menu.css', 'course.js', 'course-content.js', 'learning.js', 'example-traces.js', 'example-player.js', 'editor.js', 'codego-mark.svg', 'codego-sdk.js', 'execution-worker.js', 'terminal-input-sw.js', 'firebase-config.js', 'icon.png', 'manifest.webmanifest', 'licenses/freeCodeCamp.txt'];
FILES.push('app.js?v=stdin-2', 'codego-sdk.js?v=stdin-2', 'execution-worker.js?v=stdin-2');
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const runtime = await caches.open(RUNTIME_CACHE);
    for (const key of await caches.keys()) {
      if (!key.startsWith('codego-') || key === CACHE || key === RUNTIME_CACHE) continue;
      const old = await caches.open(key);
      for (const request of await old.keys()) {
        const url = new URL(request.url);
        if ((url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/pyodide/v0.27.7/full/')) || (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/12.7.0/'))) {
          const response = await old.match(request); if (response) await runtime.put(request, response);
        }
      }
      await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (self.codegoHandleStdin(event, url)) return;
  if (event.request.method !== 'GET' || url.pathname.startsWith('/__/')) return;
  const local = url.origin === location.origin;
  const runtime = url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/pyodide/v0.27.7/full/');
  const firebase = url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/12.7.0/');
  if (!local && !runtime && !firebase) return;
  event.respondWith(caches.open(runtime || firebase ? RUNTIME_CACHE : CACHE).then(async cache => {
    const cached = await cache.match(event.request);
    // Fresh HTML selects a coherent set of versioned execution assets. Cached
    // documents remain available offline without touching workspace storage.
    if (local && event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) { try { await cache.put(event.request, response.clone()); } catch (_) {} return response; }
      } catch (_) {}
      if (cached) return cached;
    }
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
