// API de Lindwyrm (un solo handler para Netlify Functions y para el servidor local).
// Espacio para exactamente 2 personas. Cada una es dueña de su propio documento (`user/<id>.doc`);
// lo compartido (propuestas, cupones, mensajes, fotos) vive en claves aparte para que no se pisen.
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHmac, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { createStorage } from './storage.mjs';

const db = createStorage();
const TOKEN_DAYS = 180;
const MAX_DOC = 1_500_000;
const MAX_PHOTO = 3_000_000;
const MAX_EVIDENCE = 5_000_000;
const EVIDENCE_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg'];
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
  const invite = Array.from(randomBytes(6), (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
  await db.set('meta', { secret: randomBytes(32).toString('base64'), inviteCode: invite, users: [], createdAt: Date.now() });
  const user = await createUser({ name, pin: google ? null : String(body.pin), color: '#34d6a0', google });
  const meta = await db.get('meta');
  meta.users.push(user.id);
  await db.set('meta', meta);
  return json(200, { token: await sign(user.id), uid: user.id, inviteCode: invite });
}

async function join(body, google) {
  const meta = await db.get('meta');
  if (!meta) return fail(404, 'Aún no existe el espacio. Que la primera persona lo cree.');
  if (meta.users.length >= 2) return fail(409, 'Este espacio ya tiene a sus dos personas.');
  if (clean(body.inviteCode, 12).toUpperCase() !== meta.inviteCode) return fail(403, 'Código de invitación incorrecto.');
  const name = clean(body.name || google?.name, 20);
  const bad = google ? (name ? null : 'Escribe tu nombre.') : validCreds(body.name, body.pin);
  if (bad) return fail(400, bad);
  const first = await db.get(`user/${meta.users[0]}`);
  if (norm(first.name) === norm(name)) return fail(409, 'Ese nombre ya está en uso; usa otro.');
  if (google && first.googleSub === google.sub) return fail(409, 'Esa cuenta de Google ya está en uso por tu pareja.');
  const user = await createUser({ name, pin: google ? null : String(body.pin), color: '#ff5c93', google });
  meta.users.push(user.id);
  await db.set('meta', meta);
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
  await db.set(`user/${user.id}`, user);
  return json(200, { token: await sign(user.id), uid: user.id });
}

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
  const [proposals, vouchers, messages, challenges] = await Promise.all([listItems('proposal/', 100), listItems('voucher/', 60), listItems('message/', 60), listItems('challenge/', 80)]);
  return json(200, {
    me: user.doc.updatedAt > meAt ? user.doc : null,
    partner: partnerRec
      ? { id: partnerRec.id, name: partnerRec.name, doc: partnerRec.doc.updatedAt > partnerAt ? publicDoc(partnerRec.doc) : null, updatedAt: partnerRec.doc.updatedAt }
      : null,
    inviteCode: !partnerRec && meta.users[0] === user.id ? meta.inviteCode : null,
    proposals, vouchers, messages, challenges,
    account: { google: !!user.googleSub, email: user.email || '', hasPin: !!user.hash },
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
  user.doc = doc;
  user.name = doc.name;
  await db.set(`user/${user.id}`, user);
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
  return json(200, { proposal: p });
}

async function postVoucher(user, body) {
  const p = await db.get(`proposal/${body.proposalId}`);
  if (!p || p.status !== 'accepted') return fail(404, 'Ese premio no está activo.');
  const id = randomUUID();
  const v = { id, proposalId: p.id, name: p.name, emoji: p.emoji, cost: p.cost, by: user.id, status: 'open', ts: Date.now() };
  await db.set(`voucher/${String(v.ts).padStart(13, '0')}-${id}`, v);
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
  const kind = ['cheer', 'text', 'reaction'].includes(body.kind) ? body.kind : 'text';
  if (!text) return fail(400, 'Escribe algo.');
  const id = randomUUID();
  const ref = body.ref && typeof body.ref === 'object' ? { uid: clean(body.ref.uid, 60), date: clean(body.ref.date, 10) } : null;
  const m = { id, from: user.id, text, kind, ref, likes: [], ts: Date.now() };
  await db.set(`message/${String(m.ts).padStart(13, '0')}-${id}`, m);
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
  return json(200, { challenge: c });
}

async function getEvidence(id) {
  const f = await loadChallenge(id);
  const bin = f && f.c.evidence && (await db.getBin(`evidence/${id}`));
  if (!bin) return fail(404, 'No hay evidencia para ese reto.');
  return new Response(bin.data, { headers: { 'content-type': bin.type, 'cache-control': 'private, max-age=3600' } });
}

// ---------- router ----------
export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)/, '') || '/';
    const m = req.method;
    const body = async () => (await req.json().catch(() => ({})));

    if (m === 'GET' && path === '/status') return await status();
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
    if (m === 'POST' && path === '/auth/google/link') return await linkGoogle(user, await body());
    if (m === 'POST' && path === '/auth/pin') return await setPin(user, await body());
    if (m === 'POST' && path === '/challenges') return await postChallenge(user, await body());
    if (m === 'POST' && (r = path.match(/^\/challenges\/([^/]+)\/(start|evidence|review|cancel)$/))) return await challengeAction(user, r[1], r[2], req, url, r[2] === 'review' ? await body() : {});
    if (m === 'GET' && (r = path.match(/^\/challenges\/([^/]+)\/evidence$/))) return await getEvidence(r[1]);
    if (m === 'POST' && (r = path.match(/^\/messages\/([^/]+)\/like$/))) return await likeMessage(user, r[1]);
    if (m === 'POST' && (r = path.match(/^\/messages\/([^/]+)\/delete$/))) return await deleteMessage(user, r[1]);
    return fail(404, 'Ruta no encontrada.');
  } catch (e) {
    if (e instanceof HttpError) return await fail(e.status, e.message);
    console.error(e);
    return fail(500, 'Error del servidor. Intenta de nuevo.');
  }
}
