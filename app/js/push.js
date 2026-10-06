// Notificaciones push en el teléfono. En iPhone solo existen si la app está instalada en la pantalla de inicio (iOS 16.4+).
import * as S from './store.js';

const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Qué puede hacer este dispositivo. */
export function pushSupport() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return { supported, ios, standalone, needsInstall: ios && !standalone, permission: supported ? Notification.permission : 'unsupported' };
}

export async function currentSubscription() {
  if (!pushSupport().supported) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Pide permiso (debe llamarse desde un toque), suscribe este dispositivo y lo registra en el servidor. */
export async function enablePush() {
  if (!pushSupport().supported) return { ok: false, error: 'Este navegador no admite notificaciones.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'Permiso denegado. Actívalo en los ajustes del teléfono para Lindwyrm.' };
  const keyRes = await S.request('GET', '/push/key');
  if (!keyRes.ok) return { ok: false, error: keyRes.data.error || 'No pude conectar con el servidor.' };
  const reg = await navigator.serviceWorker.ready;
  const options = { userVisibleOnly: true, applicationServerKey: b64ToBytes(keyRes.data.key) };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe(options).catch(() => null);
  if (!sub) return { ok: false, error: 'El teléfono no pudo crear la suscripción. Inténtalo de nuevo.' };
  const res = await S.request('POST', '/push/subscribe', { subscription: sub.toJSON() });
  if (!res.ok) return { ok: false, error: res.data.error || 'No se pudo guardar la suscripción.' };
  await S.syncNow();
  return { ok: true };
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await S.request('POST', '/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe().catch(() => {});
  }
  await S.syncNow();
}

export const setPrefs = async (prefs) => { const r = await S.request('POST', '/push/prefs', prefs); if (r.ok) await S.syncNow(); return r; };
export const sendTest = () => S.request('POST', '/push/test');
