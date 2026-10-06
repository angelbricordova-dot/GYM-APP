// API de Lindwyrm (un solo handler para Netlify Functions y para el servidor local).
// Espacio para exactamente 2 personas. Cada una es dueña de su propio documento (`user/<id>.doc`);
// lo compartido (propuestas, cupones, mensajes, fotos) vive en claves aparte para que no se pisen.
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHmac, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { createStorage } from './storage.mjs';
import { createPush, DEFAULT_PREFS } from './push.mjs';
import * as L from '../app/js/logic.js';

export { _push } from './push.mjs';

const db = createStorage();
const push = createPush(db);
export const runReminders = (now) => push.runReminders(now);
const TOKEN_DAYS = 180;
const MAX_DOC = 1_500_000;
const MAX_PHOTO = 3_000_000;
const MAX_EVIDENCE = 5_000_000;
const EVIDENCE_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg'];

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const fail = (status, error) => json(status, { error });

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const norm = (s) => clean(s, 40).toLowerCase();
const b64 = (buf) => Buffer.from(buf).toString('base64url');

// ---------- contraseñas y tokens ----------
const hashPin = (pin, salt) => new Promise((res, rej) => scrypt(pin, salt, 32, (e, k) => (e ? rej(e) : res(k))));

async function secret() {
  const meta = await db.get('meta');
  return meta?.secret;
}

async function sign(uid) {
  const body = b64(JSON.stringify({ uid, exp: Date.now() + TOKEN_DAYS * 864e5 }));
  const mac = createHmac('sha256', await secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

async function authUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const [body, mac] = token.split('.');
  const key = await secret();
  if (!body || !mac || !key) return null;
  const good = createHmac('sha256', key).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (exp < Date.now()) return null;
    return await db.get(`user/${uid}`);
  } catch { return null; }
}

// ---------- Google ----------
// Se verifica el ID token de “Iniciar sesión con Google” (RS256) contra las llaves públicas de Google.
// Requiere la variable GOOGLE_CLIENT_ID (el ID de cliente OAuth de tipo “Aplicación web”).
export const _google = { fetchJwks: async () => (await fetch('https://www.googleapis.com/oauth2/v3/certs')).json() };
let jwks = { at: 0, keys: [] };

async function googleKey(kid) {
  if (!jwks.keys.some((k) => k.kid === kid) || Date.now() - jwks.at > 3_600_000) jwks = { at: Date.now(), keys: (await _google.fetchJwks()).keys || [] };
  return jwks.keys.find((k) => k.kid === kid);
}

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function verifyGoogle(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(501, 'Google aún no está configurado en este sitio.');
  const [h, p, sig] = String(credential || '').split('.');
  if (!h || !p || !sig) throw new HttpError(400, 'Credencial de Google inválida.');
  let header, claims;
  try { header = JSON.parse(Buffer.from(h, 'base64url')); claims = JSON.parse(Buffer.from(p, 'base64url')); } catch { throw new HttpError(400, 'Credencial de Google inválida.'); }
  const jwk = header.alg === 'RS256' ? await googleKey(header.kid) : null;
  if (!jwk) throw new HttpError(401, 'No pude verificar tu cuenta de Google.');
  const ok = cryptoVerify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(sig, 'base64url'));
  const goodIss = ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss);
  if (!ok || !goodIss || claims.aud !== clientId || !(claims.exp * 1000 > Date.now()) || !claims.sub) throw new HttpError(401, 'No pude verificar tu cuenta de Google.');
  if (claims.email && claims.email_verified === false) throw new HttpError(401, 'Tu correo de Google no está verificado.');
  return { sub: claims.sub, email: claims.email || '', name: claims.given_name || claims.name || '' };
}

async function allUsers() {
  const meta = await db.get('meta');
  return meta ? Promise.all(meta.users.map((id) => db.get(`user/${id}`))) : [];
}

// ---------- documentos ----------
const emptyDoc = (id, name, extra = {}) => ({
  v: 2, id, name, color: extra.color || '#8b7cff', avatar: null, heightCm: null, weeklyGoal: 3,
  restDays: 2, shareWeight: false, weights: [], sessions: [], checkins: {}, pauses: [], ledger: [], routines: [],
  createdAt: Date.now(), updatedAt: Date.now(),
});

/** Lo que la pareja puede ver de mi documento. El peso corporal es privado salvo que lo comparta. */
const publicDoc = (doc) => (doc.shareWeight ? doc : { ...doc, weights: [] });

async function createUser({ name, pin, color, google }) {
  const id = randomUUID();
  const salt = randomBytes(16);
  const rec = { id, name, salt: salt.toString('base64'), hash: pin ? (await hashPin(pin, salt)).toString('base64') : null, googleSub: google?.sub || null, email: google?.email || '', fails: 0, lockUntil: 0, doc: emptyDoc(id, name, { color }) };
  await db.set(`user/${id}`, rec);
  return rec;
}

const validCreds = (name, pin) => {
  if (!clean(name, 20)) return 'Escribe tu nombre.';
  if (!/^\d{4,8}$/.test(String(pin))) return 'El PIN debe tener de 4 a 8 números.';
  return null;
};

// ---------- rutas ----------
async function status() {
  const meta = await db.get('meta');
  return json(200, { setup: !!meta, full: !!meta && meta.users.length >= 2, needsSetupCode: !!process.env.SETUP_CODE, googleClientId: process.env.GOOGLE_CLIENT_ID || null });
}

async function setup(body, google) {
  if (await db.get('meta')) return fail(409, 'Este espacio ya fue creado. Usa “Entrar” o “Unirme con código”.');
  if (process.env.SETUP_CODE && body.setupCode !== process.env.SETUP_CODE) return fail(403, 'Código de configuración incorrecto.');
  const name = clean(body.name || google?.name, 20);
  const bad = google ? (name ? null : 'Escribe tu nombre.') : validCreds(body.name, body.pin);
  if (bad) return fail(400, bad);
  const invite = newInviteCode();
  await db.set('meta', { secret: randomBytes(32).toString('base64'), inviteCode: invite, users: [], createdAt: Date.now() });
  const user = await createUser({ name, pin: google ? null : String(body.pin), color: '#34d6a0', google });
  const meta = await db.get('meta');
  meta.users.push(user.id);
  await db.set('meta', meta);
  return json(200, { token: await sign(user.id), uid: user.id, inviteCode: invite });
}

const newInviteCode = () => Array.from(randomBytes(6), (b) => L.INVITE_ALPHABET[b % L.INVITE_ALPHABET.length]).join('');

/** Valida un código de invitación con freno anti-adivinanza (8 fallos → 10 minutos de espera). Devuelve una respuesta de error o null. */
async function checkInvite(meta, code) {
  if (!meta) return fail(404, 'Aún no existe el espacio. Que la primera persona lo cree.');
  if (meta.users.length >= 2) return fail(409, 'Este espacio ya tiene a sus dos personas.');
  const f = meta.inviteFails || { n: 0, until: 0 };
  if (f.until > Date.now()) return fail(429, 'Demasiados intentos con el código. Espera unos minutos.');
  if (L.canonInvite(code) !== L.canonInvite(meta.inviteCode)) {
    f.n += 1;
    if (f.n >= 8) { f.until = Date.now() + 10 * 60_000; f.n = 0; }
    meta.inviteFails = f;
    await db.set('meta', meta);
    return fail(403, 'Código de invitación incorrecto.');
  }
  if (f.n) { meta.inviteFails = { n: 0, until: 0 }; await db.set('meta', meta); }
  return null;
}

/** Comprueba un código sin gastar el espacio y devuelve el nombre de quien invita (para el mensaje de bienvenida). */
async function inviteInfo(url) {
  const meta = await db.get('meta');
  const badCode = await checkInvite(meta, url.searchParams.get('code'));
  if (badCode) return badCode;
  return json(200, { ok: true, inviter: (await db.get(`user/${meta.users[0]}`)).name });
}

async function join(body, google) {
  const meta = await db.get('meta');
  const badCode = await checkInvite(meta, body.inviteCode);
  if (badCode) return badCode;
  if (!L.pactOk(body.pact)) return fail(400, `Para unirte escribe: “${L.PACT_PHRASE}”.`);
  const name = clean(body.name || google?.name, 20);
  const bad = google ? (name ? null : 'Escribe tu nombre.') : validCreds(body.name, body.pin);
  if (bad) return fail(400, bad);
  const inviter = await db.get(`user/${meta.users[0]}`);
  if (norm(inviter.name) === norm(name)) return fail(409, 'Ese nombre ya está en uso; usa otro.');
  if (google && inviter.googleSub === google.sub) return fail(409, 'Esa cuenta de Google ya está en uso por tu pareja.');
  const user = await createUser({ name, pin: google ? null : String(body.pin), color: '#ff5c93', google });
  meta.users.push(user.id);
  await db.set('meta', meta);
  // Primera nota del tablero: la aceptación. Queda como recuerdo para los dos.
  const note = { id: randomUUID(), from: user.id, text: 'Acepto, mi amor. Te amo mucho 💗', kind: 'text', ref: null, likes: [], ts: Date.now() };
  await db.set(`message/${String(note.ts).padStart(13, '0')}-${note.id}`, note);
  await push.notify(meta.users[0], { type: 'notes', title: `💌 ${first(name)} aceptó unirse`, body: note.text, url: '/?tab=together' });
  return json(200, { token: await sign(user.id), uid: user.id });
}

async function googleAuth(body) {
  const g = await verifyGoogle(body.credential);
  if (body.mode === 'setup') return setup(body, g);
  if (body.mode === 'join') return join(body, g);
  const user = (await allUsers()).find((u) => u.googleSub === g.sub);
  if (!user) return fail(404, 'Esa cuenta de Google aún no está vinculada. Entra con tu PIN y vincúlala en Perfil.');
  return json(200, { token: await sign(user.id), uid: user.id });
}

async function linkGoogle(user, body) {
  const g = await verifyGoogle(body.credential);
  const taken = (await allUsers()).find((u) => u.googleSub === g.sub && u.id !== user.id);
  if (taken) return fail(409, 'Esa cuenta de Google ya está vinculada a otra persona.');
  user.googleSub = g.sub;
  user.email = g.email;
  await db.set(`user/${user.id}`, user);
  return json(200, { ok: true, email: g.email });
}

async function setPin(user, body) {
  if (!/^\d{4,8}$/.test(String(body.pin))) return fail(400, 'El PIN debe tener de 4 a 8 números.');
  const salt = randomBytes(16);
  user.salt = salt.toString('base64');
  user.hash = (await hashPin(String(body.pin), salt)).toString('base64');
  await db.set(`user/${user.id}`, user);
  return json(200, { ok: true });
}

async function login(body) {
  const meta = await db.get('meta');
  if (!meta) return fail(404, 'Aún no existe el espacio.');
  const users = await Promise.all(meta.users.map((id) => db.get(`user/${id}`)));
  const user = users.find((u) => norm(u.name) === norm(body.name));
  if (!user) return fail(401, 'Nombre o PIN incorrecto.');
  if (user.lockUntil > Date.now()) return fail(429, 'Demasiados intentos. Espera unos minutos.');
  if (!user.hash) return fail(401, 'Esta cuenta entra con Google. Usa “Continuar con Google”.');
  const ok = timingSafeEqual(await hashPin(String(body.pin), Buffer.from(user.salt, 'base64')), Buffer.from(user.hash, 'base64'));
  if (!ok) {
    user.fails = (user.fails || 0) + 1;
    if (user.fails >= 5) { user.lockUntil = Date.now() + 5 * 60_000; user.fails = 0; }
    await db.set(`user/${user.id}`, user);
    return fail(401, 'Nombre o PIN incorrecto.');
  }
  user.fails = 0;
  // Entrar con PIN + una cuenta de Google en el mismo paso la vincula (se prueba que eres tú con las dos cosas).
  if (body.credential) {
    const g = await verifyGoogle(body.credential);
    const taken = (await allUsers()).find((u) => u.googleSub === g.sub && u.id !== user.id);
    if (taken) return fail(409, 'Esa cuenta de Google ya está vinculada a otra persona.');
    user.googleSub = g.sub;
    user.email = g.email;
  }
  await db.set(`user/${user.id}`, user);
  return json(200, { token: await sign(user.id), uid: user.id });
}

const partnerOf = async (user) => (await db.get('meta')).users.find((id) => id !== user.id);
/** Avisa a la pareja sin bloquear ni romper la acción que lo originó. */
const tell = async (user, msg) => { const to = await partnerOf(user); return to ? push.notify(to, msg) : null; };
const first = (s) => String(s).split(' ')[0];

async function listItems(prefix, limit) {
  const keys = (await db.list(prefix)).slice(-limit);
  return (await Promise.all(keys.map((k) => db.get(k)))).filter(Boolean);
}

async function sync(user, url) {
  const meta = await db.get('meta');
  const partnerId = meta.users.find((id) => id !== user.id);
  const partnerRec = partnerId ? await db.get(`user/${partnerId}`) : null;
  const meAt = Number(url.searchParams.get('meAt')) || 0;
  const partnerAt = Number(url.searchParams.get('partnerAt')) || 0;
  const [proposals, vouchers, messages, challenges, routines] = await Promise.all([listItems('proposal/', 100), listItems('voucher/', 60), listItems('message/', 60), listItems('challenge/', 80), listItems('routine/', 40)]);
  return json(200, {
    me: user.doc.updatedAt > meAt ? user.doc : null,
    partner: partnerRec
      ? { id: partnerRec.id, name: partnerRec.name, doc: partnerRec.doc.updatedAt > partnerAt ? publicDoc(partnerRec.doc) : null, updatedAt: partnerRec.doc.updatedAt }
      : null,
    inviteCode: !partnerRec && meta.users[0] === user.id ? meta.inviteCode : null,
    proposals, vouchers, messages, challenges, routines,
    account: { google: !!user.googleSub, email: user.email || '', hasPin: !!user.hash, push: { devices: (user.push || []).length, prefs: { ...DEFAULT_PREFS, ...user.pushPrefs } } },
    serverTime: Date.now(),
  });
}

async function putMe(user, req) {
  const text = await req.text();
  if (text.length > MAX_DOC) return fail(413, 'Tus datos son demasiado grandes.');
  let doc;
  try { doc = JSON.parse(text).doc; } catch { return fail(400, 'JSON inválido.'); }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return fail(400, 'Documento inválido.');
  if (typeof doc.avatar === 'string' && doc.avatar.length > 120_000) doc.avatar = null;
  if ((doc.updatedAt || 0) < user.doc.updatedAt) return json(409, { error: 'Hay datos más nuevos en otro dispositivo.', doc: user.doc });
  doc.id = user.id;
  doc.name = clean(doc.name, 20) || user.name;
  if (typeof doc.tz !== 'string' || doc.tz.length > 60) doc.tz = user.doc.tz || 'UTC';
  const before = new Set(Object.keys(user.doc.checkins || {}));
  const added = Object.keys(doc.checkins || {}).filter((d) => !before.has(d));
  user.doc = doc;
  user.name = doc.name;
  await db.set(`user/${user.id}`, user);
  const today = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (added.some((d) => d >= today)) { // solo check-ins recientes: ediciones de días viejos no avisan
    const info = L.streakInfo(doc, added.sort().at(-1));
    await tell(user, { type: 'workouts', title: `${first(user.name)} ya entrenó 🔥`, body: info.current > 1 ? `Va en racha de ${info.current} días. ¡Mándale ánimo!` : '¡Mándale ánimo!', url: '/?tab=together' });
  }
  return json(200, { ok: true, updatedAt: doc.updatedAt });
}

async function postPhoto(user, req, url) {
  const id = url.searchParams.get('id') || '';
  if (!/^[a-z0-9-]{6,40}$/.test(id)) return fail(400, 'Id de foto inválido.');
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > MAX_PHOTO) return fail(413, 'La foto es demasiado grande.');
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return fail(400, 'Solo se aceptan fotos JPEG.');
  await db.setBin(`photo/${user.id}/${id}`, buf, 'image/jpeg');
  return json(200, { ok: true });
}

async function getPhoto(uid, pid) {
  if (!/^[a-zA-Z0-9-]+$/.test(uid) || !/^[a-z0-9-]{6,40}$/.test(pid)) return fail(400, 'Id inválido.');
  const bin = await db.getBin(`photo/${uid}/${pid}`);
  if (!bin) return fail(404, 'No existe esa foto.');
  return new Response(bin.data, { headers: { 'content-type': bin.type, 'cache-control': 'private, max-age=31536000, immutable' } });
}

async function postProposal(user, body) {
  const name = clean(body.name, 60);
  const cost = Math.round(Number(body.cost));
  if (!name || !(cost >= 1 && cost <= 9999)) return fail(400, 'Pon un nombre y un costo entre 1 y 9999.');
  const id = randomUUID();
  const p = { id, name, emoji: clean(body.emoji, 4) || '🎁', note: clean(body.note, 140), cost, by: user.id, lastBy: user.id, status: 'pending', history: [{ by: user.id, cost, ts: Date.now() }], createdAt: Date.now() };
  await db.set(`proposal/${id}`, p);
  await tell(user, { type: 'prizes', title: `${first(user.name)} propuso un premio ${p.emoji}`, body: `${p.name} · ${p.cost} puntos de amor`, url: '/?tab=rewards' });
  return json(200, { proposal: p });
}

async function decideProposal(user, id, body) {
  const p = await db.get(`proposal/${id}`);
  if (!p) return fail(404, 'No existe esa propuesta.');
  if (p.status !== 'pending') return fail(409, 'Esa propuesta ya fue resuelta.');
  if (p.lastBy === user.id) return fail(403, 'Ahora le toca decidir a tu pareja.');
  if (body.action === 'accept') { p.status = 'accepted'; p.decidedBy = user.id; }
  else if (body.action === 'decline') { p.status = 'declined'; p.decidedBy = user.id; }
  else if (body.action === 'counter') {
    const cost = Math.round(Number(body.cost));
    if (!(cost >= 1 && cost <= 9999)) return fail(400, 'Costo inválido.');
    p.cost = cost; p.lastBy = user.id; p.history.push({ by: user.id, cost, ts: Date.now() });
  } else return fail(400, 'Acción inválida.');
  p.updatedAt = Date.now();
  await db.set(`proposal/${id}`, p);
  const verb = { accepted: 'aceptó', declined: 'rechazó' }[p.status] || `contraofertó ${p.cost} puntos por`;
  await tell(user, { type: 'prizes', title: `${first(user.name)} ${verb} tu idea ${p.emoji}`, body: p.name, url: '/?tab=rewards' });
  return json(200, { proposal: p });
}

async function postVoucher(user, body) {
  const p = await db.get(`proposal/${body.proposalId}`);
  if (!p || p.status !== 'accepted') return fail(404, 'Ese premio no está activo.');
  const id = randomUUID();
  const v = { id, proposalId: p.id, name: p.name, emoji: p.emoji, cost: p.cost, by: user.id, status: 'open', ts: Date.now() };
  await db.set(`voucher/${String(v.ts).padStart(13, '0')}-${id}`, v);
  await tell(user, { type: 'prizes', title: `${first(user.name)} canjeó ${p.emoji} ${p.name}`, body: 'Tienes un cupón por cumplir', url: '/?tab=rewards' });
  return json(200, { voucher: v });
}

async function doneVoucher(id) {
  const key = (await db.list('voucher/')).find((k) => k.endsWith(`-${id}`));
  if (!key) return fail(404, 'No existe ese cupón.');
  const v = await db.get(key);
  v.status = 'done'; v.doneAt = Date.now();
  await db.set(key, v);
  return json(200, { voucher: v });
}

async function postMessage(user, body) {
  const text = clean(body.text, 280);
  const kind = ['cheer', 'text', 'reaction', 'skip'].includes(body.kind) ? body.kind : 'text';
  if (!text) return fail(400, 'Escribe algo.');
  const id = randomUUID();
  let ref = body.ref && typeof body.ref === 'object' ? { uid: clean(body.ref.uid, 60), date: clean(body.ref.date, 10) } : null;
  if (kind === 'skip') { // “hoy no fui”: la fecha es la del día de quien lo cuenta; su pareja decidirá la penalización
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ref?.date || '')) return fail(400, 'Falta la fecha.');
    ref = { uid: user.id, date: ref.date };
  }
  const m = { id, from: user.id, text, kind, ref, likes: [], ts: Date.now() };
  if (kind === 'skip') m.penalty = null;
  await db.set(`message/${String(m.ts).padStart(13, '0')}-${id}`, m);
  await tell(user, kind === 'reaction'
    ? { type: 'notes', title: `${first(user.name)} reaccionó ${text} a tu entreno`, url: '/?tab=together' }
    : kind === 'skip'
      ? { type: 'notes', title: `😔 ${first(user.name)} hoy no fue al gym`, body: `${text} · Decide cuántos puntos de amor le quitas`, url: '/?tab=together' }
      : { type: 'notes', title: `💌 Nota de ${first(user.name)}`, body: text, url: '/?tab=together' });
  return json(200, { message: m });
}

const findKey = async (prefix, id) => (await db.list(prefix)).find((k) => k.endsWith(`-${id}`));

async function likeMessage(user, id) {
  const key = await findKey('message/', id);
  const m = key && (await db.get(key));
  if (!m) return fail(404, 'No existe ese mensaje.');
  m.likes = m.likes || [];
  m.likes = m.likes.includes(user.id) ? m.likes.filter((x) => x !== user.id) : [...m.likes, user.id];
  await db.set(key, m);
  if (m.likes.includes(user.id) && m.from !== user.id) await push.notify(m.from, { type: 'notes', title: `${first(user.name)} le dio ❤️ a tu nota`, body: m.text, url: '/?tab=together' });
  return json(200, { message: m });
}

/** Quien NO escribió el “hoy no fui” decide, una sola vez, cuántos puntos de amor quita (1 a 100). */
async function penalizeMessage(user, id, body) {
  const key = await findKey('message/', id);
  const m = key && (await db.get(key));
  if (!m || m.kind !== 'skip') return fail(404, 'No existe ese aviso.');
  if (m.from === user.id) return fail(403, 'Eso lo decide tu pareja.');
  if (m.penalty) return fail(409, 'Ya decidiste cuántos puntos quitar.');
  const points = Math.round(Number(body.points));
  if (!(points >= L.PENALTY.min && points <= L.PENALTY.max)) return fail(400, `Elige de ${L.PENALTY.min} a ${L.PENALTY.max} puntos.`);
  m.penalty = { points, by: user.id, ts: Date.now() };
  await db.set(key, m);
  await push.notify(m.from, { type: 'notes', title: `${first(user.name)} te quitó ${points} puntos de amor`, body: m.text, url: '/?tab=together' });
  return json(200, { message: m });
}

async function deleteMessage(user, id) {
  const key = await findKey('message/', id);
  const m = key && (await db.get(key));
  if (!m) return fail(404, 'No existe ese mensaje.');
  if (m.from !== user.id) return fail(403, 'Solo quien lo escribió puede borrarlo.');
  await db.del(key);
  return json(200, { ok: true });
}

// ---------- retos ----------
// Un reto lo pone una persona a la otra: abierto → iniciado → evidencia enviada → aprobado/rechazado.
// Los puntos de amor los suma el cliente de quien lo cumplió cuando ve el reto aprobado (cada quien escribe solo su documento).
const challengeKey = (c) => `challenge/${String(c.ts).padStart(13, '0')}-${c.id}`;

async function loadChallenge(id) {
  const key = await findKey('challenge/', id);
  return key ? { key, c: await db.get(key) } : null;
}

async function postChallenge(user, body) {
  const meta = await db.get('meta');
  const to = meta.users.find((x) => x !== user.id);
  if (!to) return fail(409, 'Tu pareja aún no se une.');
  const title = clean(body.title, 80);
  const points = Math.round(Number(body.points));
  if (!title || !(points >= 1 && points <= 500)) return fail(400, 'Escribe el reto y unos puntos entre 1 y 500.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : new Date().toISOString().slice(0, 10);
  const c = { id: randomUUID(), ts: Date.now(), from: user.id, to, title, detail: clean(body.detail, 140), points, date, status: 'open', evidence: null };
  await db.set(challengeKey(c), c);
  await push.notify(to, { type: 'challenges', title: `${first(user.name)} te retó 🎯`, body: `${title} · ${points} puntos de amor`, url: '/?tab=today' });
  return json(200, { challenge: c });
}

async function challengeAction(user, id, action, req, url, body) {
  const f = await loadChallenge(id);
  if (!f) return fail(404, 'No existe ese reto.');
  const { key, c } = f;
  const isTo = c.to === user.id, isFrom = c.from === user.id;
  if (action === 'start') {
    if (!isTo) return fail(403, 'Solo quien recibe el reto puede iniciarlo.');
    if (!['open', 'rejected'].includes(c.status)) return fail(409, 'Este reto ya no se puede iniciar.');
    c.status = 'started'; c.startedAt = Date.now();
  } else if (action === 'evidence') {
    if (!isTo) return fail(403, 'Solo quien recibe el reto puede enviar evidencia.');
    if (!['open', 'started', 'rejected'].includes(c.status)) return fail(409, 'Este reto ya no admite evidencia.');
    const type = (req.headers.get('content-type') || '').split(';')[0].trim();
    if (!EVIDENCE_TYPES.includes(type)) return fail(400, 'Formato no admitido. Usa video MP4/WebM o foto JPEG.');
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length > MAX_EVIDENCE) return fail(413, 'El archivo pesa demasiado (máx. 5 MB). Graba un video más corto.');
    if (type === 'image/jpeg' && (buf[0] !== 0xff || buf[1] !== 0xd8)) return fail(400, 'Foto inválida.');
    await db.setBin(`evidence/${c.id}`, buf, type);
    c.evidence = { kind: type.startsWith('video') ? 'video' : 'photo', type, ts: Date.now() };
    c.status = 'submitted'; c.note = '';
  } else if (action === 'review') {
    if (!isFrom) return fail(403, 'Solo quien puso el reto puede revisarlo.');
    if (c.status !== 'submitted') return fail(409, 'Este reto no tiene evidencia por revisar.');
    if (body.action === 'approve') { c.status = 'approved'; c.approvedAt = Date.now(); }
    else if (body.action === 'reject') { c.status = 'rejected'; c.note = clean(body.note, 140); }
    else return fail(400, 'Acción inválida.');
  } else if (action === 'cancel') {
    if (!isFrom) return fail(403, 'Solo quien puso el reto puede cancelarlo.');
    if (c.status === 'approved') return fail(409, 'Un reto aprobado ya no se puede cancelar.');
    c.status = 'cancelled';
  } else return fail(404, 'Ruta no encontrada.');
  c.updatedAt = Date.now();
  await db.set(key, c);
  const other = isTo ? c.from : c.to;
  if (action === 'evidence') await push.notify(other, { type: 'challenges', title: `${first(user.name)} envió su evidencia 📹`, body: `${c.title}: revísala y apruébala`, url: '/?tab=today' });
  else if (action === 'review') await push.notify(other, { type: 'challenges', title: c.status === 'approved' ? `¡Reto aprobado! +${c.points} puntos de amor 💗` : 'Te pidieron repetir el reto', body: c.status === 'approved' ? c.title : c.note || c.title, url: '/?tab=today' });
  return json(200, { challenge: c });
}

async function getEvidence(id) {
  const f = await loadChallenge(id);
  const bin = f && f.c.evidence && (await db.getBin(`evidence/${id}`));
  if (!bin) return fail(404, 'No hay evidencia para ese reto.');
  return new Response(bin.data, { headers: { 'content-type': bin.type, 'cache-control': 'private, max-age=3600' } });
}

// ---------- rutinas compartidas ----------
// Una persona le recomienda una rutina a la otra. Quien la recibe la ve en Juntos → Rutinas y puede empezarla, guardarla o descartarla.
const routineKey = (r) => `routine/${String(r.ts).padStart(13, '0')}-${r.id}`;

async function postRoutine(user, body) {
  const to = await partnerOf(user);
  if (!to) return fail(409, 'Tu pareja aún no se une.');
  const name = clean(body.name, 40);
  const list = Array.isArray(body.exercises) ? body.exercises.slice(0, 20) : [];
  const exercises = list
    .map((e) => ({ name: clean(typeof e === 'string' ? e : e?.name, 40), sets: Math.min(10, Math.max(1, Math.round(Number(e?.sets)) || 3)), reps: Math.min(50, Math.max(1, Math.round(Number(e?.reps)) || 10)) }))
    .filter((e) => e.name);
  if (!name || !exercises.length) return fail(400, 'Ponle nombre y al menos un ejercicio.');
  const r = { id: randomUUID(), ts: Date.now(), from: user.id, to, name, note: clean(body.note, 200), exercises, status: 'new' };
  await db.set(routineKey(r), r);
  await push.notify(to, { type: 'routines', title: `${first(user.name)} te recomendó una rutina 🏋️`, body: `${name} · ${exercises.length} ejercicios`, url: '/?tab=together' });
  return json(200, { routine: r });
}

async function routineAction(user, id, action) {
  const key = await findKey('routine/', id);
  const r = key && (await db.get(key));
  if (!r) return fail(404, 'No existe esa rutina.');
  if (action === 'delete') {
    if (r.from !== user.id) return fail(403, 'Solo quien la compartió puede quitarla.');
    await db.del(key);
    return json(200, { ok: true });
  }
  if (r.to !== user.id) return fail(403, 'Esa rutina es para tu pareja.');
  const order = { new: 0, seen: 1, dismissed: 2, saved: 3 };
  const next = { seen: 'seen', save: 'saved', dismiss: 'dismissed' }[action];
  if (!next) return fail(404, 'Ruta no encontrada.');
  if (order[next] >= order[r.status]) { r.status = next; r.updatedAt = Date.now(); await db.set(key, r); }
  return json(200, { routine: r });
}

// ---------- reiniciar progreso y eliminar cuenta ----------
const wipePhotos = async (uid) => { for (const k of await db.list(`photo/${uid}/`)) await db.del(k); };

/** Borra TODO el progreso de esta persona (entrenos, check-ins, fotos, peso, puntos, rutinas, pausas) y conserva su cuenta y ajustes. */
async function resetMe(user) {
  await wipePhotos(user.id);
  for (const k of await db.list('challenge/')) {
    const c = await db.get(k);
    if (c?.to !== user.id) continue;
    if (c.evidence) { await db.del(`evidence/${c.id}`); c.evidence = { ...c.evidence, removed: true }; }
    if (['open', 'started', 'submitted', 'rejected'].includes(c.status)) c.status = 'cancelled'; // sus retos pendientes se cancelan
    await db.set(k, c);
  }
  for (const k of await db.list('routine/')) { const r = await db.get(k); if (r?.to === user.id && r.status !== 'new') await db.del(k); }
  const d = user.doc;
  const now = Date.now();
  user.doc = {
    ...emptyDoc(user.id, user.name, { color: d.color }),
    avatar: d.avatar, supps: d.supps, heightCm: d.heightCm, weeklyGoal: d.weeklyGoal, restDays: d.restDays, shareWeight: d.shareWeight, tz: d.tz, onboarded: d.onboarded,
    resetAt: now, createdAt: now, updatedAt: Math.max(now, d.updatedAt + 1),
  };
  await db.set(`user/${user.id}`, user);
  return json(200, { ok: true, doc: user.doc });
}

/** Elimina la cuenta y todo lo que esta persona creó. Si era la última, el espacio queda libre para crearse de nuevo. */
async function deleteMe(user) {
  const meta = await db.get('meta');
  await wipePhotos(user.id);
  for (const k of await db.list('challenge/')) {
    const c = await db.get(k);
    if (c && (c.from === user.id || c.to === user.id)) { await db.del(`evidence/${c.id}`); await db.del(k); }
  }
  for (const [prefix, who] of [['message/', 'from'], ['routine/', 'from'], ['voucher/', 'by'], ['proposal/', 'by']]) {
    for (const k of await db.list(prefix)) { const x = await db.get(k); if (x && (x[who] === user.id || x.to === user.id)) await db.del(k); }
  }
  await db.del(`user/${user.id}`);
  meta.users = meta.users.filter((id) => id !== user.id);
  if (!meta.users.length) await db.del('meta');
  else { meta.inviteCode = newInviteCode(); await db.set('meta', meta); }
  return json(200, { ok: true });
}

// ---------- notificaciones push ----------
async function pushRoutes(user, path, body, method) {
  if (method === 'GET' && path === '/push/key') return json(200, { key: await push.publicKey() });
  if (path === '/push/subscribe') return (await push.subscribe(user, body.subscription)) ? json(200, { ok: true }) : fail(400, 'Suscripción inválida.');
  if (path === '/push/unsubscribe') { await push.unsubscribe(user, String(body.endpoint || '')); return json(200, { ok: true }); }
  if (path === '/push/prefs') return json(200, { prefs: await push.setPrefs(user, body) });
  if (path === '/push/test') {
    const r = await push.notify(user.id, { title: 'Lindwyrm', body: '¡Las notificaciones funcionan! 💗', url: '/', tag: 'test' });
    return r.sent ? json(200, { ok: true, sent: r.sent }) : fail(409, 'No hay ningún dispositivo suscrito. Activa las notificaciones primero.');
  }
  return fail(404, 'Ruta no encontrada.');
}

// ---------- router ----------
export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)/, '') || '/';
    const m = req.method;
    const body = async () => (await req.json().catch(() => ({})));

    if (m === 'GET' && path === '/status') return await status();
    if (m === 'GET' && path === '/invite') return await inviteInfo(url);
    if (m === 'POST' && path === '/setup') return await setup(await body());
    if (m === 'POST' && path === '/join') return await join(await body());
    if (m === 'POST' && path === '/auth/google') return await googleAuth(await body());
    if (m === 'POST' && path === '/login') return await login(await body());

    const user = await authUser(req);
    if (!user) return await fail(401, 'Sesión no válida. Vuelve a entrar.');

    if (m === 'GET' && path === '/sync') return await sync(user, url);
    if (m === 'PUT' && path === '/me') return await putMe(user, req);
    if (m === 'POST' && path === '/photo') return await postPhoto(user, req, url);
    let r;
    if (m === 'GET' && (r = path.match(/^\/photo\/([^/]+)\/([^/]+)$/))) return await getPhoto(r[1], r[2]);
    if (m === 'POST' && path === '/proposals') return await postProposal(user, await body());
    if (m === 'POST' && (r = path.match(/^\/proposals\/([^/]+)$/))) return await decideProposal(user, r[1], await body());
    if (m === 'POST' && path === '/vouchers') return await postVoucher(user, await body());
    if (m === 'POST' && (r = path.match(/^\/vouchers\/([^/]+)\/done$/))) return await doneVoucher(r[1]);
    if (m === 'POST' && path === '/messages') return await postMessage(user, await body());
    if (path.startsWith('/push/')) return await pushRoutes(user, path, m === 'POST' ? await body() : {}, m);
    if (m === 'POST' && path === '/me/reset') return await resetMe(user);
    if (m === 'POST' && path === '/me/delete') return await deleteMe(user);
    if (m === 'POST' && path === '/routines') return await postRoutine(user, await body());
    if (m === 'POST' && (r = path.match(/^\/routines\/([^/]+)\/(seen|save|dismiss|delete)$/))) return await routineAction(user, r[1], r[2]);
    if (m === 'POST' && path === '/auth/google/link') return await linkGoogle(user, await body());
    if (m === 'POST' && path === '/auth/pin') return await setPin(user, await body());
    if (m === 'POST' && path === '/challenges') return await postChallenge(user, await body());
    if (m === 'POST' && (r = path.match(/^\/challenges\/([^/]+)\/(start|evidence|review|cancel)$/))) return await challengeAction(user, r[1], r[2], req, url, r[2] === 'review' ? await body() : {});
    if (m === 'GET' && (r = path.match(/^\/challenges\/([^/]+)\/evidence$/))) return await getEvidence(r[1]);
    if (m === 'POST' && (r = path.match(/^\/messages\/([^/]+)\/like$/))) return await likeMessage(user, r[1]);
    if (m === 'POST' && (r = path.match(/^\/messages\/([^/]+)\/penalty$/))) return await penalizeMessage(user, r[1], await body());
    if (m === 'POST' && (r = path.match(/^\/messages\/([^/]+)\/delete$/))) return await deleteMessage(user, r[1]);
    return fail(404, 'Ruta no encontrada.');
  } catch (e) {
    if (e instanceof HttpError) return await fail(e.status, e.message);
    console.error(e);
    return fail(500, 'Error del servidor. Intenta de nuevo.');
  }
}
