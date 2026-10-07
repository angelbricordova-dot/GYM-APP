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

const sameKey = (sub, bytes) => {
  const k = sub.options?.applicationServerKey;
  if (!k) return true;
  const a = new Uint8Array(k);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
};

/** La suscripción de este teléfono con la llave actual del servidor. Una suscripción vieja con otra llave se descarta (los avisos le fallarían en silencio). */
async function ensureSubscription(keyB64) {
  const reg = await navigator.serviceWorker.ready;
  const bytes = b64ToBytes(keyB64);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, bytes)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) {
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }); }
    catch (e) { lastSubscribeError = `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 120)}`; sub = null; } // el motivo exacto, para mostrarlo
  }
  return sub;
}
let lastSubscribeError = '';

/** Pide permiso (debe llamarse desde un toque), suscribe este dispositivo y lo registra en el servidor. */
export async function enablePush() {
  if (!pushSupport().supported) return { ok: false, error: 'Este navegador no admite notificaciones.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'Permiso denegado. Actívalo en los ajustes del teléfono para Lindwyrm.' };
  const keyRes = await S.request('GET', '/push/key');
  if (!keyRes.ok) return { ok: false, error: keyRes.data.error || 'No pude conectar con el servidor.' };
  const sub = await ensureSubscription(keyRes.data.key);
  if (!sub) return { ok: false, error: `El teléfono no pudo crear la suscripción${lastSubscribeError ? ` (${lastSubscribeError})` : ''}. Inténtalo de nuevo.` };
  const res = await S.request('POST', '/push/subscribe', { subscription: sub.toJSON() });
  if (!res.ok) return { ok: false, error: res.data.error || 'No se pudo guardar la suscripción.' };
  await S.syncNow();
  return { ok: true };
}

/** Borra la suscripción de este teléfono y crea una nueva (arregla llaves viejas, suscripciones caducadas o registros perdidos). */
export async function repairPush() {
  await S.request('POST', '/push/unsubscribe', { all: true }); // primero se limpian los registros viejos del servidor
  const sub = await currentSubscription();
  if (sub) {
    await S.request('POST', '/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe().catch(() => {});
  }
  return enablePush();
}

/** Al abrir la app, si ya hay permiso: vuelve a registrar este teléfono (no cambia nada si ya estaba) y corrige una llave vieja. */
export async function refreshPush() {
  try {
    if (!pushSupport().supported || Notification.permission !== 'granted') return;
    const keyRes = await S.request('GET', '/push/key');
    if (!keyRes.ok) return;
    const sub = await ensureSubscription(keyRes.data.key);
    if (sub) await S.request('POST', '/push/subscribe', { subscription: sub.toJSON() });
  } catch { /* se intentará en la próxima apertura */ }
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
/** Prueba de notificación. Con `delay` (segundos) el servidor espera antes de enviar: da tiempo de cerrar la app o bloquear el teléfono. */
/** Notificación local: no pasa por el servidor ni por Apple/Google. Si se ve, el teléfono SÍ puede mostrar avisos y el problema está en el envío. */
export async function localTest() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Prueba en este teléfono', { body: 'Si ves esto, el teléfono sí puede mostrar avisos 💗', icon: '/icons/icon-192.png', tag: 'local-test' });
}
/** ¿Este teléfono está en la lista del servidor? */
export async function serverHasMe() {
  const sub = await currentSubscription();
  if (!sub) return { local: false, registered: false, devices: null };
  const r = await S.request('POST', '/push/check', { endpoint: sub.endpoint });
  return { local: true, registered: !!r.data.registered, devices: r.data.devices ?? null, endpoint: sub.endpoint };
}
export const sendTest = (delay = 0) => S.request('POST', '/push/test', { delay });
/** Qué servicio de avisos usa este teléfono (según la dirección de su suscripción). */
export const serviceOf = (endpoint = '') => (/apple\.com/.test(endpoint) ? 'Apple (iPhone)' : /googleapis|google\.com/.test(endpoint) ? 'Google (Android/Chrome)' : /mozilla/.test(endpoint) ? 'Firefox' : /windows/.test(endpoint) ? 'Microsoft' : endpoint ? 'otro' : '—');
