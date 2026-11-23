self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
  if (!data || data.type !== 'SHOW_LOCAL_NOTIFICATION') return;

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
