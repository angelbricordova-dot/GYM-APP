// Notificaciones push (Web Push + VAPID). Las llaves VAPID se generan solas la primera vez y se guardan
// en el servidor: no hay que configurar nada. En iPhone solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4+).
import webpush from 'web-push';
import * as L from '../app/js/logic.js';

/** Punto de envío intercambiable (las pruebas lo reemplazan para no llamar a Apple/Google). */
export const _push = { send: (sub, payload, opts) => webpush.sendNotification(sub, payload, opts) };

export const DEFAULT_PREFS = { challenges: true, notes: true, workouts: true, routines: true, prizes: true, reminder: false, reminderHour: 18 };
const TIMEOUT_MS = 2500;

export function createPush(db) {
  async function keys() {
    const meta = await db.get('meta');
    if (!meta.vapid) { meta.vapid = webpush.generateVAPIDKeys(); await db.set('meta', meta); }
    return meta.vapid;
  }
  // Apple exige un “sub” válido: https del sitio (Netlify define URL) o mailto.
  const subject = () => process.env.VAPID_SUBJECT || process.env.URL || 'mailto:soporte@lindwyrm.app';

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

  /** Envía una notificación a todos los dispositivos de una persona. Nunca lanza: una falla de push no debe romper la acción. */
  async function notify(uid, msg) {
    try {
      const user = uid && (await db.get(`user/${uid}`));
      if (!user?.push?.length) return { sent: 0 };
      const prefs = { ...DEFAULT_PREFS, ...user.pushPrefs };
      if (msg.type && prefs[msg.type] === false) return { sent: 0, skipped: true };
      const k = await keys();
      const payload = JSON.stringify({ title: msg.title, body: msg.body || '', url: msg.url || '/', tag: msg.tag || msg.type || 'lindwyrm', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
      const opts = { vapidDetails: { subject: subject(), publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 86_400, urgency: 'normal' };
      const alive = [];
      let sent = 0;
      for (const sub of user.push) {
        try {
          await Promise.race([_push.send(sub, payload, opts), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))]);
          alive.push(sub); sent++;
        } catch (e) {
          if (![404, 410].includes(e.statusCode)) alive.push(sub); // 404/410: el dispositivo ya no existe, se elimina
        }
      }
      if (alive.length !== user.push.length) { user.push = alive; await db.set(`user/${user.id}`, user); }
      return { sent };
    } catch (e) {
      console.error('push:', e.message);
      return { sent: 0, error: true };
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

  return { publicKey, subscribe, unsubscribe, setPrefs, notify, runReminders };
}
