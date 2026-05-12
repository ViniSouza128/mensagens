/* ── Mensagens — Service Worker ───────────────────────────────
   Estratégia:
   · Assets estáticos (JS/CSS/imagens): cache-first
   · Chamadas de API (/api/*): network-only (dados sempre frescos)
   · Navegação: network-first com fallback para offline.html
   ─────────────────────────────────────────────────────────── */

const CACHE = 'mensagens-v1';
const OFFLINE_PAGE = '/offline.html';

/* ── Install ──────────────────────────────────────────────── */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_PAGE, '/favicon.svg', '/icon.svg', '/manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // não bloqueia instalação se algo falhar
  );
});

/* ── Activate ─────────────────────────────────────────────── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch ────────────────────────────────────────────────── */
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignora requisições não-GET e cross-origin
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API: sempre rede (sem cache para evitar dados obsoletos)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Assets estáticos: cache-first
  if (/\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp|gif)(\?.*)?$/.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then(
        (cached) => cached || fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone)).catch(() => {});
          }
          return res;
        })
      )
    );
    return;
  }

  // Navegação: network-first, fallback offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_PAGE).then((r) => r || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }
});
