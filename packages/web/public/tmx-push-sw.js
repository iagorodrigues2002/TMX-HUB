/* No fetch handler or caching: authenticated TMX pages never enter a SW cache. */
const openStore = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('tmx-browser-push', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
async function session(userId) {
  const db = await openStore();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put(userId, 'session');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function claim(message) {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      let accepted = false;
      const current = store.get('session');
      current.onsuccess = () => {
        if (current.result !== message.userId) return;
        const previous = store.get(`sale:${message.id}`);
        previous.onsuccess = () => {
          if (previous.result) return;
          store.put(Date.now(), `sale:${message.id}`);
          accepted = true;
        };
      };
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (String(item.key).startsWith('sale:') && item.value < Date.now() - 86400000)
          item.delete();
        item.continue();
      };
      tx.oncomplete = () => resolve(accepted);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type !== 'TMX_PUSH_SESSION') return;
  const userId = event.data.userId;
  if (userId !== null && (typeof userId !== 'string' || userId.length > 128)) return;
  event.waitUntil(
    session(userId)
      .then(async () => {
        if (!userId)
          for (const notice of await self.registration.getNotifications()) notice.close();
        event.ports[0]?.postMessage({ ok: true });
      })
      .catch(() => event.ports[0]?.postMessage({ ok: false })),
  );
});
self.addEventListener('push', (event) =>
  event.waitUntil(
    (async () => {
      let message;
      try {
        message = event.data?.json();
      } catch {
        return;
      }
      if (
        !message ||
        typeof message.id !== 'string' ||
        message.id.length > 128 ||
        typeof message.userId !== 'string'
      )
        return;
      const time = Date.parse(message.createdAt);
      if (!Number.isFinite(time) || Date.now() - time > 120000) return;
      if (!(await claim(message))) return;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((client) => client.visibilityState === 'visible' && client.focused)) return;
      await self.registration.showNotification('Nova venda aprovada · TMX', {
        body: 'Abra o TMX para ver os detalhes.',
        tag: `tmx-sale:${message.id}`,
        icon: '/brand/the-minex-mark.png',
        badge: '/favicon.ico',
        data: { url: '/' },
        renotify: false,
      });
    })(),
  ),
);
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (client) await client.focus();
      else await self.clients.openWindow('/');
    })(),
  );
});
