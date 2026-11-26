const STATIC_CACHE = 'drvet-static-v1';
const VET_PAGES_CACHE = 'drvet-vet-pages-v1';
const VET_OFFLINE_PATH_PREFIXES = [
  '/painel/veterinario',
  '/agenda',
  '/prontuarios',
  '/agendamento',
];

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('drvet-') &&
                key !== STATIC_CACHE &&
                key !== VET_PAGES_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function sanitizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return '/agendamento';
  }
  try {
    const parsed = new URL(rawUrl, self.location.origin);
    if (parsed.origin === self.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return '/agendamento';
  }
  return '/agendamento';
}

function isCacheableStaticPath(pathname) {
  if (pathname.startsWith('/_next/webpack-hmr')) return false;
  return (
    pathname.startsWith('/_next/static/') ||
    pathname === '/pwa-192x192.png' ||
    pathname === '/pwa-512x512.png' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/stitch-vet-hero.webp' ||
    pathname === '/icon.svg'
  );
}

function isVetOfflineNavigationPath(pathname) {
  return VET_OFFLINE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isCacheableStaticPath(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          void cache.put(request, response.clone());
        }
        return response;
      }),
    );
    return;
  }

  if (request.mode === 'navigate' && isVetOfflineNavigationPath(url.pathname)) {
    event.respondWith(
      caches.open(VET_PAGES_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (
            response &&
            response.ok &&
            response.type === 'basic' &&
            !response.redirected
          ) {
            void cache.put(request, response.clone());
          }
          return response;
        } catch {
          const exactMatch = await cache.match(request);
          if (exactMatch) return exactMatch;
          const dashboardFallback = await cache.match('/painel/veterinario');
          if (dashboardFallback) return dashboardFallback;
          const recordsFallback = await cache.match('/prontuarios');
          if (recordsFallback) return recordsFallback;
          throw new Error('Offline navigation unavailable');
        }
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'DrVet Telemedicina',
    body: 'Você tem uma atualização no seu atendimento veterinário.',
    url: '/agendamento',
    tag: 'drvet-notification',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
        url: sanitizeUrl(parsed.url),
      };
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.tag,
      renotify: true,
      requireInteraction: false,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'CLEAR_OFFLINE_CACHE') {
    event.waitUntil(caches.delete(VET_PAGES_CACHE));
    return;
  }

  if (data.type !== 'SHOW_LOCAL_NOTIFICATION') return;

  const title =
    typeof data.title === 'string' && data.title.trim()
      ? data.title.trim()
      : 'DrVet Telemedicina';
  const body =
    typeof data.body === 'string' && data.body.trim()
      ? data.body.trim()
      : 'Você possui uma nova notificação.';
  const tag =
    typeof data.tag === 'string' && data.tag.trim()
      ? data.tag.trim()
      : `drvet-${Date.now()}`;
  const url = sanitizeUrl(data.url);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = sanitizeUrl(event.notification?.data?.url);

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            try {
              const clientUrl = new URL(client.url);
              if (clientUrl.origin === self.location.origin) {
                if ('navigate' in client && clientUrl.pathname !== targetPath) {
                  void client.navigate(targetPath);
                }
                return client.focus();
              }
            } catch {
              // ignore malformed client url
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetPath);
        }
        return undefined;
      }),
  );
});
