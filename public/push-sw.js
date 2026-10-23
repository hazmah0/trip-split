self.addEventListener('push', (e) => {
  const m = e.data ? e.data.json() : {};
  // Every push must show a notification, or iOS revokes the subscription.
  e.waitUntil(
    self.registration.showNotification(m.title || 'Trip Split', {
      body: m.body,
      icon: '/icon-192.png',
      data: { tripId: m.tripId },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = `/?trip=${encodeURIComponent(e.notification.data?.tripId ?? '')}`;
  e.waitUntil(
    (async () => {
      const [win] = await self.clients.matchAll({ type: 'window' });
      if (!win) return self.clients.openWindow(url);
      await win.focus();
      return win.navigate(url);
    })(),
  );
});
