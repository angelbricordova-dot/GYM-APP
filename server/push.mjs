// Notificaciones push (Web Push + VAPID). Las llaves VAPID se generan solas la primera vez y se guardan
// en el servidor: no hay que configurar nada. En iPhone solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4+).
import webpush from 'web-push';
import * as L from '../app/js/logic.js';

/** Punto de envío intercambiable (las pruebas lo reemplazan para no llamar a Apple/Google). */
export const _push = { send: (sub, payload, opts) => webpush.sendNotification(sub, payload, opts) };

export const DEFAULT_PREFS = { challenges: true, notes: true, workouts: true, routines: true, prizes: true, reminder: false, reminderHour: 18 };
const TIMEOUT_MS = 7000;

/** Promesa con tope de tiempo (y sin dejar el temporizador colgado). */
const withTimeout = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout')), ms);
  Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});

export function createPush(db) {
  async function keys() {
    const meta = await db.get('meta');
    if (!meta.vapid) { meta.vapid = webpush.generateVAPIDKeys(); await db.set('meta', meta); }
    return meta.vapid;
  }
  // Apple exige un “sub” válido: https del sitio (Netlify define URL) o mailto.
  // El sitio real (https) se aprende de las peticiones que llegan: en Netlify la variable URL no siempre existe al ejecutar la función.
  let origin = null;
  const noteOrigin = async (o) => {
    if (!o || !o.startsWith('https://') || o === origin) return;
    origin = o;
    try { const cur = await db.get('site'); if (cur?.origin !== o) await db.set('site', { origin: o }); } catch { /* no es crítico */ }
  };
  const subject = async () => {
    if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
    if (origin) return origin;
    try { const cur = await db.get('site'); if (cur?.origin) return cur.origin; } catch { /* sigue */ }
    return process.env.URL || 'mailto:soporte@lindwyrm.app';
  };

  const publicKey = async () => (await keys()).publicKey;

  async function subscribe(user, sub) {
    const ok = sub && typeof sub.endpoint === 'string' && sub.endpoint.startsWith('https://') && sub.keys?.p256dh && sub.keys?.auth;
    if (!ok) return false;
    const entry = { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, ts: Date.now() };
    user.push = [...(user.push || []).filter((s) => s.endpoint !== entry.endpoint), entry].slice(-5); // máx. 5 dispositivos
    await db.set(`user/${user.id}`, user);
    return true;
  }

  async function unsubscribe(user, endpoint) {
    user.push = (user.push || []).filter((s) => s.endpoint !== endpoint);
    await db.set(`user/${user.id}`, user);
  }

  async function setPrefs(user, p = {}) {
    const next = { ...DEFAULT_PREFS, ...user.pushPrefs };
    for (const k of ['challenges', 'notes', 'workouts', 'routines', 'prizes', 'reminder']) if (typeof p[k] === 'boolean') next[k] = p[k];
    if (Number.isInteger(p.reminderHour) && p.reminderHour >= 0 && p.reminderHour <= 23) next.reminderHour = p.reminderHour;
    user.pushPrefs = next;
    await db.set(`user/${user.id}`, user);
    return next;
  }

  /**
   * Envía una notificación a todos los dispositivos de una persona (en paralelo). Nunca lanza: una falla de push no debe romper la acción.
   * Si algo falla guarda el último error en el usuario para mostrarlo en Perfil (antes los fallos eran invisibles).
   */
  async function notify(uid, msg) {
    try {
      const user = uid && (await db.get(`user/${uid}`));
      if (!user?.push?.length) return { sent: 0 };
      const prefs = { ...DEFAULT_PREFS, ...user.pushPrefs };
      if (msg.type && prefs[msg.type] === false) return { sent: 0, skipped: true };
      const k = await keys();
      // el tag es único por aviso: dos notas seguidas se ven las dos
      const payload = JSON.stringify({ title: msg.title, body: msg.body || '', url: msg.url || '/', tag: msg.tag || `${msg.type || 'lindwyrm'}-${Date.now().toString(36)}`, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
      const vapidDetails = { subject: await subject(), publicKey: k.publicKey, privateKey: k.privateKey };
      const results = await Promise.all(user.push.map(async (sub) => {
        try {
          // Apple no usa la urgencia: se deja en “normal”; en Android (Google) “high” despierta el teléfono
          const opts = { vapidDetails, TTL: 86_400, urgency: /apple\.com/.test(sub.endpoint) ? 'normal' : 'high', timeout: TIMEOUT_MS };
          const res = await withTimeout(_push.send(sub, payload, opts), TIMEOUT_MS + 500);
          return { sub, ok: true, status: res?.statusCode || 201 };
        } catch (e) {
          return { sub, ok: false, status: e.statusCode || 0, msg: String(e.body || e.message || e).slice(0, 160) };
        }
      }));
      const sent = results.filter((r) => r.ok).length;
      const bad = results.find((r) => !r.ok);
      const alive = results.filter((r) => r.ok || ![404, 410].includes(r.status)).map((r) => r.sub); // 404/410: el dispositivo ya no existe, se elimina
      let dirty = alive.length !== user.push.length;
      if (dirty) user.push = alive;
      if (bad) { console.error('push falló:', new URL(bad.sub.endpoint).host, bad.status, bad.msg); user.pushError = { ts: Date.now(), status: bad.status, msg: bad.msg }; dirty = true; }
      else if (user.pushError) { delete user.pushError; dirty = true; }
      if (dirty) await db.set(`user/${user.id}`, user);
      const devices = results.map((r) => ({ host: new URL(r.sub.endpoint).host, ok: r.ok, status: r.status || 0 }));
      return { sent, failed: results.length - sent, devices, error: bad ? { status: bad.status, msg: bad.msg } : null };
    } catch (e) {
      console.error('push:', e.message);
      return { sent: 0, error: { status: 0, msg: e.message } };
    }
  }

  /** Recordatorio diario: una vez al día, a la hora local elegida, si aún no entrenaste. Se corre cada hora (función programada). */
  async function runReminders(now = new Date()) {
    const meta = await db.get('meta');
    let sent = 0;
    for (const id of meta?.users || []) {
      const user = await db.get(`user/${id}`);
      const prefs = { ...DEFAULT_PREFS, ...user?.pushPrefs };
      if (!user?.push?.length || !prefs.reminder) continue;
      const tz = user.doc.tz || 'UTC';
      let hour, date;
      try {
        hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now));
        date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now); // YYYY-MM-DD
      } catch { continue; }
      if (hour !== prefs.reminderHour || user.lastReminder === date || user.doc.checkins?.[date] || user.doc.skips?.[date]) continue;
      const info = L.streakInfo(user.doc, date);
      if (info.paused) continue;
      const body = info.atRisk ? `Hoy es el último día para mantener tu racha de ${info.current} días 🔥` : info.alive && info.current > 0 ? `Tu racha de ${info.current} días te espera. ¿Hoy entrenas?` : '¿Hoy toca gym? Un entreno empieza tu racha.';
      const r = await notify(id, { type: 'reminder', title: 'Lindwyrm', body, url: '/?tab=train', tag: 'reminder' });
      if (r.sent) { const fresh = await db.get(`user/${id}`); fresh.lastReminder = date; await db.set(`user/${id}`, fresh); sent++; }
    }
    return { sent };
  }

  return { publicKey, subscribe, unsubscribe, setPrefs, notify, runReminders, noteOrigin };
}
