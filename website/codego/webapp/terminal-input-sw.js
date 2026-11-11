/* Local stdin bridge. Synchronous reads block only the execution worker, never
 * the UI. These requests are answered here, including offline; nothing is sent
 * to Hosting. Random run IDs keep simultaneous tabs and executions separate. */
(() => {
  const prefix = new URL('__codego_stdin__/', self.registration.scope).pathname;
  const slots = new Map();
  const reply = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
  function remove(key, value) {
    const slot = slots.get(key);
    if (!slot) return;
    clearTimeout(slot.timer); slots.delete(key);
    slot.resolve?.(reply(value));
  }
  self.codegoHandleStdin = (event, url) => {
    if (url.origin !== self.location.origin || !url.pathname.startsWith(prefix)) return false;
    const key = url.pathname.slice(prefix.length);
    event.respondWith((async () => {
      if (key === 'ready' && event.request.method === 'GET') return reply({ protocol: 1 });
      if (!/^[a-f0-9-]{36}\/(?:[1-9]\d{0,8}|cancel)$/.test(key)) return reply({ error: 'Invalid input channel' }, 400);
      if (key.endsWith('/cancel') && event.request.method === 'POST') {
        const run = key.slice(0, -6);
        for (const name of slots.keys()) if (name.startsWith(run)) remove(name, { eof: true });
        return reply({ ok: true });
      }
      if (slots.size >= 128 && !slots.has(key)) return reply({ error: 'Too many input channels' }, 429);
      if (event.request.method === 'GET') {
        const slot = slots.get(key);
        if (slot?.value) { const value = slot.value; remove(key); return reply(value); }
        if (slot) return reply({ error: 'Already reading' }, 409);
        // Renew short waits rather than keep the service worker alive forever.
        return new Promise(resolve => {
          const timer = setTimeout(() => remove(key, { pending: true }), 8000);
          slots.set(key, { resolve, timer });
        });
      }
      if (event.request.method === 'POST') {
        const text = await event.request.text();
        if (text.length > 100000) return reply({ error: 'Input too long' }, 413);
        const value = JSON.parse(text);
        if (typeof value.value !== 'string' || value.value.length > 65536 || typeof value.eof !== 'boolean') return reply({ error: 'Invalid input' }, 400);
        if (slots.get(key)?.resolve) remove(key, value);
        else {
          remove(key);
          slots.set(key, { value, timer: setTimeout(() => remove(key), 30000) });
        }
        return reply({ ok: true });
      }
      return reply({ error: 'Method not allowed' }, 405);
    })().catch(() => reply({ error: 'Input channel failed' }, 400)));
    return true;
  };
})();
