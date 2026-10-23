import { HttpError, request } from './api.ts';

export type PushStatus = { key: string; on: boolean };

export const pushSupported =
  import.meta.env.PROD &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

const path = (tripId: string) => `/api/push/${encodeURIComponent(tripId)}`;

const base64url = (key: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(key)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export async function pushStatus(tripId: string): Promise<PushStatus | null> {
  try {
    return await request<PushStatus>('GET', path(tripId));
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

// Call straight from a tap: iOS prompts only when requestPermission is the first await of the gesture.
export async function setPush(tripId: string, key: string, on: boolean) {
  if (!on) return request<PushStatus>('DELETE', path(tripId));
  if ((await Notification.requestPermission()) !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const subKey = sub?.options.applicationServerKey;
  if (sub && (!subKey || base64url(subKey) !== key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return request<PushStatus>('PUT', path(tripId), sub.toJSON());
}
