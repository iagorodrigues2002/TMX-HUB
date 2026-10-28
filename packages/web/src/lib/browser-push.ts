import { authToken, request } from './api-client/request';

export const browserPushSupported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export async function withPushDeviceLock<T>(work: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request('tmx-push-device', work) : work();
}

export async function browserPushId(subscription: PushSubscription) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(subscription.endpoint),
  );
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
export async function pushDeviceSession(
  registration: ServiceWorkerRegistration,
  userId: string | null,
) {
  const worker = registration.active;
  if (!worker) throw new Error('Notificações ainda não estão prontas. Tente novamente.');
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('Não foi possível configurar este dispositivo.'));
    }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data?.ok) resolve();
      else reject(new Error('Não foi possível salvar a preferência.'));
    };
    worker.postMessage({ type: 'TMX_PUSH_SESSION', userId }, [channel.port2]);
  });
}
export async function disableBrowserPush(token = authToken.get()) {
  if (!browserPushSupported()) return;
  return withPushDeviceLock(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration || !registration.active?.scriptURL.endsWith('/tmx-push-sw.js')) return;
    // Disable locally before network cleanup, including offline logout.
    await pushDeviceSession(registration, null);
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const id = await browserPushId(subscription);
    await subscription.unsubscribe();
    if (token)
      await request('/v1/tracking/browser-push', {
        method: 'DELETE',
        body: { id },
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
  });
}
