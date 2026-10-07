// Estado de la app. Local primero: todo se guarda en el teléfono al instante y se sincroniza en segundo plano.
// Tu documento solo lo escribes tú; el de tu pareja llega de solo lectura.
import * as L from './logic.js';
import { cachePhoto, getPhoto, photoUrl, clearAllPhotos } from './photos.js';

const KEY = 'gymduo.v2';

const fresh = () => ({
  auth: null, // { token, uid }
  me: null,
  partner: null, // { id, name, doc, updatedAt }
  proposals: [], vouchers: [], messages: [], challenges: [], routines: [],
  account: null, // { google, email, hasPin }
  invite: null,
  pendingInvite: null, // código que llegó por enlace (?join=CODIGO) antes de tener cuenta
  seenAt: 0,
  dismissed: [], // avisos de la pantalla de inicio que cerré (ids)
  draft: null, // entreno en curso (no se sincroniza)
  meSyncedAt: 0,
  dirty: false,
});

export const state = load();
export const net = { syncing: false, online: true, error: null, lastSync: 0 };
const subs = new Set();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') return { ...fresh(), ...s };
  } catch { /* storage bloqueado o dañado */ }
  return fresh();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin storage */ }
}

export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
let version = 0;
export const getVersion = () => version;
const emit = () => { version++; subs.forEach((fn) => fn()); };
const commit = () => { save(); emit(); };

// ---------- red ----------
async function call(method, path, body, { raw, type } = {}) {
  const headers = {};
  if (type) headers['content-type'] = type;
  if (state.auth) headers.authorization = `Bearer ${state.auth.token}`;
  if (body !== undefined && !raw) headers['content-type'] = 'application/json';
  try {
    const res = await fetch(`/api${path}`, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    net.online = true;
    if (res.status === 401 && state.auth && path !== '/login') { logout(); }
    return { ok: res.ok, status: res.status, data: data || {} };
  } catch {
    net.online = false;
    return { ok: false, status: 0, data: { error: 'Sin conexión. Se guardará y se sincronizará cuando vuelva la señal.' } };
  }
}

export const request = call; // para módulos que hablan con la API (push)

const download = async (path) => {
  try {
    const res = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${state.auth.token}` } });
    return res.ok ? await res.blob() : null;
  } catch { return null; }
};
export const loadPhoto = (uid, pid) => photoUrl(uid, pid, download);

// ---------- cuenta ----------
export const getStatus = () => call('GET', '/status');
export const checkInvite = (code) => call('GET', `/invite?code=${encodeURIComponent(code)}`);
export const setPendingInvite = (code) => { state.pendingInvite = code; save(); };

async function startSession(res) {
  if (!res.ok) return res;
  Object.assign(state, fresh(), { auth: { token: res.data.token, uid: res.data.uid }, invite: res.data.inviteCode || null });
  commit();
  await syncNow();
  return res;
}

// Crear el espacio no inicia sesión aún: primero se muestra el código de invitación (ver Auth).
export const createSpace = (body) => call('POST', '/setup', body);
export const beginSession = startSession;
export const joinSpace = async (body) => startSession(await call('POST', '/join', body));
export const recoverCall = (body) => call('POST', '/recover', body);
export const recoverPin = async (body) => startSession(await call('POST', '/recover', { ...body, action: 'pin' }));
export const login = async (body) => startSession(await call('POST', '/login', body));

export function logout() {
  Object.assign(state, fresh());
  commit();
}

// ---------- sincronización ----------
let timer = null;
let again = false;

export function scheduleSync(ms = 700) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

export async function syncNow() {
  if (!state.auth) return;
  if (net.syncing) { again = true; return; }
  net.syncing = true;
  emit();
  try {
    // 0) mi zona horaria (el recordatorio diario se manda a tu hora local)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (state.me && tz && state.me.tz !== tz) { state.me.tz = tz; state.me.updatedAt = Math.max(Date.now(), state.me.updatedAt + 1); state.dirty = true; }
    // 1) subir mis cambios
    if (state.dirty && state.me) {
      const res = await call('PUT', '/me', { doc: state.me });
      if (res.ok) { state.meSyncedAt = state.me.updatedAt; state.dirty = false; }
      else if (res.status === 409 && res.data.doc) { state.me = res.data.doc; state.meSyncedAt = res.data.doc.updatedAt; state.dirty = false; }
    }
    // 2) subir fotos pendientes
    if (state.me) {
      for (const [date, c] of Object.entries(state.me.checkins)) {
        if (!c.photo || c.photoUp) continue;
        const blob = await getPhoto(`${state.auth.uid}/${c.photo}`);
        if (!blob) { c.photoUp = true; state.dirty = true; continue; } // la foto se perdió del teléfono: no reintentar
        const res = await call('POST', `/photo?id=${c.photo}`, undefined, { raw: blob });
        if (!res.ok) break;
        c.photoUp = true;
        state.me.updatedAt = Date.now();
        state.dirty = true;
      }
      if (state.dirty) { const r = await call('PUT', '/me', { doc: state.me }); if (r.ok) { state.meSyncedAt = state.me.updatedAt; state.dirty = false; } }
    }
    // 3) traer lo nuevo
    const q = `/sync?meAt=${state.meSyncedAt}&partnerAt=${state.partner?.updatedAt || 0}`;
    const res = await call('GET', q);
    if (res.ok) {
      const d = res.data;
      if (d.me && !state.dirty) { state.me = d.me; state.meSyncedAt = d.me.updatedAt; }
      state.partner = d.partner ? { id: d.partner.id, name: d.partner.name, updatedAt: d.partner.updatedAt, doc: d.partner.doc || state.partner?.doc || null } : null;
      state.invite = d.inviteCode;
      if (d.partner && state.pendingInvite) state.pendingInvite = null; // un enlace de invitación ya no aplica si tengo pareja
      state.proposals = d.proposals; state.vouchers = d.vouchers; state.messages = d.messages; state.challenges = d.challenges || []; state.routines = d.routines || [];
      state.account = d.account || null;
      reconcilePoints();
      net.error = null;
      net.lastSync = Date.now();
    } else if (res.status) net.error = res.data.error;
  } finally {
    net.syncing = false;
    commit();
    if (again) { again = false; scheduleSync(300); }
  }
}

export function startSyncLoop() {
  const kick = () => document.visibilityState === 'visible' && syncNow();
  document.addEventListener('visibilitychange', kick);
  addEventListener('online', kick);
  addEventListener('focus', kick);
  setInterval(kick, 45_000);
  kick();
}

// ---------- mutaciones de mi documento ----------
// Tras “reiniciar de cero” solo cuentan los retos aprobados DESPUÉS del reinicio.
const approvedForMe = () => state.challenges.filter((c) => c.status === 'approved' && c.to === state.me?.id && (c.approvedAt || 0) > (state.me?.resetAt || 0));

/** Puntos que mi pareja decidió quitarme por cada “hoy no fui” (por fecha). */
export const skipPenalties = () => Object.fromEntries(state.messages.filter((m) => m.kind === 'skip' && m.from === state.auth?.uid && m.penalty && m.ref?.date).map((m) => [m.ref.date, m.penalty.points]));
const awardsExtra = () => ({ challenges: approvedForMe(), skipPenalties: skipPenalties() });

/** Avisos de “hoy no fui” de mi pareja que aún no he decidido cuántos puntos quitar. */
export const skipsToDecide = () => state.messages.filter((m) => m.kind === 'skip' && m.from !== state.auth?.uid && !m.penalty && m.ref?.date && !state.partner?.doc?.checkins?.[m.ref.date]);
export const decidePenalty = (id, points) => act('POST', `/messages/${id}/penalty`, { points });

/** Los retos aprobados por mi pareja se convierten en puntos de amor en MI documento (cada quien escribe solo el suyo). */
function reconcilePoints() {
  if (!state.me) return;
  const sig = () => state.me.ledger.map((e) => e.id).join();
  const before = sig();
  L.recomputeAwards(state.me, awardsExtra());
  if (sig() !== before) { state.me.updatedAt = Math.max(Date.now(), state.me.updatedAt + 1); state.dirty = true; }
}

export function update(fn) {
  if (!state.me) return;
  fn(state.me);
  L.recomputeAwards(state.me, awardsExtra());
  state.me.updatedAt = Math.max(Date.now(), state.me.updatedAt + 1);
  state.dirty = true;
  commit();
  scheduleSync();
}

export const profile = (patch) => update((me) => Object.assign(me, patch));

export function logWeight(kg, date = L.ymd()) {
  if (!L.num(kg)) return;
  update((me) => {
    me.weights = me.weights.filter((w) => w.date !== date).concat({ date, kg: L.num(kg) }).sort((a, b) => a.date.localeCompare(b.date));
  });
}

export const startPause = (reason = '') => update((me) => { me.pauses.push({ from: L.ymd(), to: null, reason }); });
export const endPause = () => update((me) => { for (const p of me.pauses) if (!p.to) p.to = L.ymd(); });

// ---------- suplementos ----------
export const toggleSupp = (id, date = L.ymd()) => update((me) => {
  me.suppLog = me.suppLog || {};
  const set = new Set(me.suppLog[date] || []);
  set.has(id) ? set.delete(id) : set.add(id);
  me.suppLog[date] = [...set];
  for (const d of Object.keys(me.suppLog).sort().slice(0, -120)) delete me.suppLog[d]; // solo guarda ~4 meses
});
export const addSupp = ({ name, emoji, when }) => update((me) => {
  const n = String(name || '').trim().slice(0, 30);
  if (!n) return;
  me.supps = [...L.suppList(me), { id: L.uid(), name: n, emoji: String(emoji || '💊').slice(0, 4), when: when === 'gym' ? 'gym' : 'daily' }];
});
/** Restar puntos por cada día que pase sin tomar creatina o proteína (cuenta desde hoy). */
export const setSuppPenalty = (on) => update((me) => { if (on) me.suppPenaltySince = me.suppPenaltySince || L.ymd(); else delete me.suppPenaltySince; });
export const removeSupp = (id) => update((me) => { me.supps = L.suppList(me).filter((x) => x.id !== id); });

// ---------- “hoy no voy” ----------
/** Cuenta la razón y se la manda a tu pareja, que decide cuántos puntos de amor te quita (no cuenta si al final sí entrenas ese día). */
export async function skipToday(reason) {
  const text = String(reason || '').trim().slice(0, 140);
  const date = L.ymd();
  if (!text) return { ok: false, data: { error: 'Escribe la razón.' } };
  if (state.me.checkins[date] || state.me.skips?.[date]) return { ok: false, data: { error: 'Hoy ya está registrado.' } };
  update((me) => { me.skips = me.skips || {}; me.skips[date] = { reason: text, ts: Date.now() }; });
  const res = await call('POST', '/messages', { text, kind: 'skip', ref: { uid: state.auth.uid, date } });
  if (res.ok) await syncNow();
  return { ok: true, sent: res.ok, data: res.data };
}

export const saveRoutine = (r) => update((me) => { me.routines = me.routines.filter((x) => x.id !== r.id).concat(r); });
export const deleteRoutine = (id) => update((me) => { me.routines = me.routines.filter((x) => x.id !== id); });
export const deleteSession = (id) => update((me) => { me.sessions = me.sessions.filter((s) => s.id !== id); });

export function saveSession(s) {
  const clean = {
    id: s.editingId || L.uid(), date: s.date || L.ymd(), time: s.time || L.hm(), durationMin: s.durationMin || 0, note: (s.note || '').trim(),
    exercises: s.exercises
      .map((ex) => ({ name: ex.name.trim(), sets: ex.sets.filter((x) => x.done && L.num(x.reps) > 0).map((x) => ({ kg: L.num(x.kg), reps: Math.round(L.num(x.reps)) })) }))
      .filter((ex) => ex.name && ex.sets.length),
  };
  if (!clean.exercises.length) return null;
  update((me) => { me.sessions = s.editingId ? me.sessions.map((x) => (x.id === s.editingId ? clean : x)) : [...me.sessions, clean]; });
  return clean;
}

/** Check-in del día con foto de salida (la foto es lo que activa la racha). */
export async function checkIn({ blob, sessionId, date = L.ymd() }) {
  let photo = null;
  if (blob) {
    photo = `${L.uid()}-${Date.now().toString(36)}`.replace(/[^a-z0-9-]/g, '').slice(0, 40);
    await cachePhoto(state.auth.uid, photo, blob);
  }
  update((me) => { me.checkins[date] = { ts: Date.now(), time: L.hm(), photo, photoUp: !blob, sessionId: sessionId || null }; });
}

export const removeCheckin = (date) => update((me) => { delete me.checkins[date]; });

/** Editar un entreno ya guardado: se abre como borrador con todas sus series marcadas. */
export function beginEdit(id) {
  const s = state.me.sessions.find((x) => x.id === id);
  if (!s || state.draft) return false;
  state.draft = {
    editingId: s.id, startedAt: Date.now(), date: s.date, time: s.time, durationMin: s.durationMin || 0, note: s.note || '',
    exercises: s.exercises.map((ex) => ({ id: L.uid(), name: ex.name, sets: ex.sets.map((x) => ({ id: L.uid(), kg: x.kg ? String(x.kg) : '', reps: String(x.reps), done: true })) })),
  };
  commit();
  return true;
}

// ---------- borrador del entreno en curso ----------
export const setDraft = (d) => { state.draft = d; save(); emit(); };

// ---------- pareja: propuestas, cupones y mensajes ----------
async function act(method, path, body) {
  const res = await call(method, path, body);
  if (res.ok) await syncNow();
  return res;
}

export const propose = (p) => act('POST', '/proposals', p);
export const decide = (id, action, cost) => act('POST', `/proposals/${id}`, { action, cost });
export const markVoucherDone = (id) => act('POST', `/vouchers/${id}/done`);
export const sendMessage = (text, kind = 'text', ref = null) => act('POST', '/messages', { text, kind, ref });
/** Corazón al instante (optimista): se ve de inmediato y el servidor lo confirma; si falla, se revierte. */
export async function likeMessage(id) {
  const m = state.messages.find((x) => x.id === id);
  const me = uid();
  if (!m || !me) return { ok: false, data: {} };
  const before = m.likes || [];
  m.likes = before.includes(me) ? before.filter((x) => x !== me) : [...before, me];
  commit();
  const res = await call('POST', `/messages/${id}/like`);
  if (res.ok) m.likes = res.data.message.likes; else m.likes = before;
  commit();
  return res;
}

export const dismiss = (id) => { state.dismissed = [...(state.dismissed || []), id].slice(-60); commit(); };
export const isDismissed = (id) => (state.dismissed || []).includes(id);
export const deleteMessage = (id) => act('POST', `/messages/${id}/delete`);

// ---------- retos ----------
export const createChallenge = (c) => act('POST', '/challenges', c);
export const startChallenge = (id) => act('POST', `/challenges/${id}/start`);
export const reviewChallenge = (id, action, note = '') => act('POST', `/challenges/${id}/review`, { action, note });
export const cancelChallenge = (id) => act('POST', `/challenges/${id}/cancel`);

/** Sube la evidencia (video o foto). Exige conexión: devuelve el error para que la pantalla permita reintentar. */
export async function submitEvidence(id, blob) {
  const res = await call('POST', `/challenges/${id}/evidence`, undefined, { raw: blob, type: blob.type.split(';')[0] });
  if (res.ok) await syncNow();
  return res;
}

const evidenceUrls = new Map();
export function loadEvidence(c) {
  const k = `${c.id}:${c.evidence?.ts}`;
  if (!evidenceUrls.has(k)) evidenceUrls.set(k, download(`/challenges/${c.id}/evidence`).then((b) => (b ? URL.createObjectURL(b) : null)));
  return evidenceUrls.get(k);
}

const uid = () => state.auth?.uid;
/** Retos que me pusieron y siguen pendientes de hacer. */
export const challengesForMe = () => state.challenges.filter((c) => c.to === uid() && ['open', 'started', 'rejected'].includes(c.status));
/** Retos que cumplí y esperan la aprobación de mi pareja (se muestran, pero no requieren acción mía). */
export const challengesWaiting = () => state.challenges.filter((c) => c.to === uid() && c.status === 'submitted');
/** Retos que yo puse y tienen evidencia esperando mi revisión. */
export const challengesToReview = () => state.challenges.filter((c) => c.from === uid() && c.status === 'submitted');

// ---------- Google ----------
export const googleLogin = async (credential) => startSession(await call('POST', '/auth/google', { credential, mode: 'login' }));
export const googleSetup = (body) => call('POST', '/auth/google', { ...body, mode: 'setup' });
export const googleJoin = async (body) => startSession(await call('POST', '/auth/google', { ...body, mode: 'join' }));
export async function linkGoogle(credential) { const r = await call('POST', '/auth/google/link', { credential }); if (r.ok) await syncNow(); return r; }
export async function setPin(pin) { const r = await call('POST', '/auth/pin', { pin }); if (r.ok) await syncNow(); return r; }

export async function redeem(proposal) {
  if (L.balance(state.me) < proposal.cost) return { ok: false, data: { error: 'Aún no te alcanzan los puntos de amor.' } };
  const res = await call('POST', '/vouchers', { proposalId: proposal.id });
  if (!res.ok) return res;
  update((me) => me.ledger.push({ id: L.uid(), ts: Date.now(), date: L.ymd(), delta: -proposal.cost, reason: `Canje: ${proposal.emoji} ${proposal.name}`, ref: res.data.voucher.id }));
  await syncNow();
  return res;
}

export const markSeen = () => { state.seenAt = Date.now(); commit(); };
export const unread = () => state.messages.filter((m) => m.from !== state.auth?.uid && m.kind !== 'skip' && m.kind !== 'reaction' && m.ts > state.seenAt).length;
export const pendingForMe = () => state.proposals.filter((p) => p.status === 'pending' && p.lastBy !== state.auth?.uid);

export function exportJSON() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), me: state.me, partner: state.partner?.doc }, null, 2);
}

// ---------- rutinas compartidas ----------
export const shareRoutine = (r) => act('POST', '/routines', r);
export const routineAction = (id, action) => act('POST', `/routines/${id}/${action}`);
/** Las rutinas que mi pareja me recomendó (sin las que descarté). */
export const routinesForMe = () => state.routines.filter((r) => r.to === uid() && r.status !== 'dismissed');
export const routinesNew = () => state.routines.filter((r) => r.to === uid() && r.status === 'new');

export async function saveSharedRoutine(r) {
  const res = await routineAction(r.id, 'save');
  if (res.ok) saveRoutine({ id: L.uid(), name: r.name, exercises: r.exercises.map((e) => ({ ...e })) });
  return res;
}

// ---------- reiniciar y eliminar ----------
/** Borra TODO mi progreso (entrenos, fotos, peso, puntos, rutinas, racha). Conserva la cuenta y los ajustes. */
export async function resetProgress() {
  const res = await call('POST', '/me/reset');
  if (!res.ok) return res;
  await clearAllPhotos();
  state.me = res.data.doc;
  state.meSyncedAt = res.data.doc.updatedAt;
  state.dirty = false;
  state.draft = null;
  commit();
  await syncNow();
  return res;
}

/** Salir de la vinculación con mi pareja (queda mi progreso; lo compartido se borra). */
export async function leavePartner() {
  await syncNow(); // primero subo mis cambios para que no se pisen
  const res = await call('POST', '/me/leave');
  if (res.ok) { state.partner = null; state.messages = []; state.challenges = []; state.proposals = []; state.vouchers = []; state.routines = []; state.invite = res.data.inviteCode; commit(); await syncNow(); }
  return res;
}
/** Ya con cuenta y sin pareja: unirme al espacio de otra persona con su código. */
export async function joinOther({ inviteCode, pact }) {
  const res = await call('POST', '/me/join', { inviteCode, pact });
  if (res.ok) { state.pendingInvite = null; commit(); await syncNow(); }
  return res;
}

/** Elimina mi usuario y todo lo que creé. Cierra la sesión. */
export async function deleteAccount() {
  const res = await call('POST', '/me/delete');
  if (!res.ok) return res;
  await clearAllPhotos();
  logout();
  return res;
}
