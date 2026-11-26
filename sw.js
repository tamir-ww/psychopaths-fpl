/* פסיכו פאנטזי: offline and instant start.
   Pages and data: network first (fresh when online), the last copy when offline.
   Images, icons and fonts: from the cache first. __BUILD__ is replaced at deploy. */
const V = 'pp-__BUILD__', SHELL = ['./', 'index.html', 'manifest.webmanifest', 'assets/logo.jpg', 'assets/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const fresh = async (req, key) => {
  const c = await caches.open(V);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(req, { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    if (r.ok) c.put(key, r.clone());
    return r;
  } catch (err) {
    const hit = await c.match(key, { ignoreSearch: true });
    if (!hit) throw err;
    const h = new Headers(hit.headers); h.set('x-pp-offline', '1');
    return new Response(await hit.blob(), { status: 200, headers: h });
  }
};
const stored = async req => {
  const c = await caches.open(V), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r;
};
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (req.mode === 'navigate') return e.respondWith(fresh(req, 'index.html'));
    if (u.pathname.endsWith('/data.json')) return e.respondWith(fresh(req, u.origin + u.pathname));
    if (/\/assets\/|\.webmanifest$/.test(u.pathname)) return e.respondWith(stored(req));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) e.respondWith(stored(req));
});
