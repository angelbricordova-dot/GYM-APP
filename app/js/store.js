// Estado de la app. Local primero: todo se guarda en el teléfono al instante y se sincroniza en segundo plano.
// Tu documento solo lo escribes tú; el de tu pareja llega de solo lectura.
import * as L from './logic.js';
import { cachePhoto, getPhoto, photoUrl } from './photos.js';

const KEY = 'gymduo.v2';

const fresh = () => ({
  auth: null, // { token, uid }
  me: null,
  partner: null, // { id, name, doc, updatedAt }
  proposals: [], vouchers: [], messages: [],
  invite: null,
  seenAt: 0,
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
async function call(method, path, body, { raw } = {}) {
  const headers = {};
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

const download = async (path) => {
  try {
    const res = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${state.auth.token}` } });
    return res.ok ? await res.blob() : null;
  } catch { return null; }
};
export const loadPhoto = (uid, pid) => photoUrl(uid, pid, download);

// ---------- cuenta ----------
export const getStatus = () => call('GET', '/status');

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
      if (d.partner) state.partner = { id: d.partner.id, name: d.partner.name, updatedAt: d.partner.updatedAt, doc: d.partner.doc || state.partner?.doc || null };
      state.invite = d.inviteCode;
      state.proposals = d.proposals; state.vouchers = d.vouchers; state.messages = d.messages;
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
export function update(fn) {
  if (!state.me) return;
  fn(state.me);
  L.recomputeAwards(state.me);
  state.me.updatedAt = Math.max(Date.now(), state.me.updatedAt + 1);
  state.dirty = true;
  commit();
  scheduleSync();
}

export const profile = (patch) => update((me) => Object.assign(me, patch));
export const addWater = (ml, date = L.ymd()) => update((me) => { me.water[date] = Math.max(0, (me.water[date] || 0) + ml); });

export function logWeight(kg, date = L.ymd()) {
  if (!L.num(kg)) return;
  update((me) => {
    me.weights = me.weights.filter((w) => w.date !== date).concat({ date, kg: L.num(kg) }).sort((a, b) => a.date.localeCompare(b.date));
  });
}

export const startPause = (reason = '') => update((me) => { me.pauses.push({ from: L.ymd(), to: null, reason }); });
export const endPause = () => update((me) => { for (const p of me.pauses) if (!p.to) p.to = L.ymd(); });

export const saveRoutine = (r) => update((me) => { me.routines = me.routines.filter((x) => x.id !== r.id).concat(r); });
export const deleteRoutine = (id) => update((me) => { me.routines = me.routines.filter((x) => x.id !== id); });
export const deleteSession = (id) => update((me) => { me.sessions = me.sessions.filter((s) => s.id !== id); });

export function saveSession(s) {
  const clean = {
    id: L.uid(), date: s.date || L.ymd(), time: s.time || L.hm(), durationMin: s.durationMin || 0, note: (s.note || '').trim(),
    exercises: s.exercises
      .map((ex) => ({ name: ex.name.trim(), sets: ex.sets.filter((x) => x.done && L.num(x.reps) > 0).map((x) => ({ kg: L.num(x.kg), reps: Math.round(L.num(x.reps)) })) }))
      .filter((ex) => ex.name && ex.sets.length),
  };
  if (!clean.exercises.length) return null;
  update((me) => me.sessions.push(clean));
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

export async function redeem(proposal) {
  if (L.balance(state.me) < proposal.cost) return { ok: false, data: { error: 'Aún no te alcanzan los tokens.' } };
  const res = await call('POST', '/vouchers', { proposalId: proposal.id });
  if (!res.ok) return res;
  update((me) => me.ledger.push({ id: L.uid(), ts: Date.now(), date: L.ymd(), delta: -proposal.cost, reason: `Canje: ${proposal.emoji} ${proposal.name}`, ref: res.data.voucher.id }));
  await syncNow();
  return res;
}

export const markSeen = () => { state.seenAt = Date.now(); commit(); };
export const unread = () => state.messages.filter((m) => m.from !== state.auth?.uid && m.ts > state.seenAt).length;
export const pendingForMe = () => state.proposals.filter((p) => p.status === 'pending' && p.lastBy !== state.auth?.uid);

export function exportJSON() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), me: state.me, partner: state.partner?.doc }, null, 2);
}
