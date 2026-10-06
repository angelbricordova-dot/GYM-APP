import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-'));
process.env.GOOGLE_CLIENT_ID = 'cliente-123.apps.googleusercontent.com';
const { default: api, _google } = await import('../server/handler.mjs');

// Llaves de Google simuladas: el servidor verifica la firma RS256 igual que con las reales.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
_google.fetchJwks = async () => ({ keys: [jwk] });
const idToken = (claims, { key = privateKey, kid = 'k1' } = {}) => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b({ iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 3600, email_verified: true, ...claims });
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
};

const call = async (method, path, { token, body, raw, type } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !raw) headers['content-type'] = 'application/json';
  if (type) headers['content-type'] = type;
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }));
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};

let A, B, invite;

test('Google: crear el espacio y unirse sin PIN, y entrar de nuevo con Google', async () => {
  assert.equal((await call('GET', '/status')).data.googleClientId, process.env.GOOGLE_CLIENT_ID);
  const forged = idToken({ sub: 'g-ang' }, { key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey });
  assert.equal((await call('POST', '/auth/google', { body: { credential: forged, mode: 'setup', name: 'Ángel' } })).status, 401); // firma falsa
  assert.equal((await call('POST', '/auth/google', { body: { credential: idToken({ sub: 'g-ang', aud: 'otro' }), mode: 'setup' } })).status, 401); // otra app
  assert.equal((await call('POST', '/auth/google', { body: { credential: idToken({ sub: 'g-ang', exp: 1 }), mode: 'setup' } })).status, 401); // vencido

  const s = await call('POST', '/auth/google', { body: { credential: idToken({ sub: 'g-ang', given_name: 'Ángel', email: 'a@x.com' }), mode: 'setup' } });
  assert.equal(s.status, 200);
  A = s.data; invite = s.data.inviteCode;
  const j = await call('POST', '/auth/google', { body: { credential: idToken({ sub: 'g-ange', given_name: 'Angélica' }), mode: 'join', inviteCode: invite, pact: 'acepto mi amor te amo mucho' } });
  assert.equal(j.status, 200);
  B = j.data;

  const again = await call('POST', '/auth/google', { body: { credential: idToken({ sub: 'g-ang' }), mode: 'login' } });
  assert.equal(again.status, 200);
  assert.equal(again.data.uid, A.uid);
  assert.equal((await call('POST', '/auth/google', { body: { credential: idToken({ sub: 'desconocida' }), mode: 'login' } })).status, 404);
  assert.equal((await call('POST', '/login', { body: { name: 'Ángel', pin: '1234' } })).status, 401); // sin PIN aún
});

test('Google: poner un PIN y vincular otra cuenta (sin robar la de la pareja)', async () => {
  assert.equal((await call('POST', '/auth/pin', { token: A.token, body: { pin: '12' } })).status, 400);
  assert.equal((await call('POST', '/auth/pin', { token: A.token, body: { pin: '1234' } })).status, 200);
  assert.equal((await call('POST', '/login', { body: { name: 'Ángel', pin: '1234' } })).status, 200);
  assert.equal((await call('POST', '/auth/google/link', { token: A.token, body: { credential: idToken({ sub: 'g-ange' }) } })).status, 409);
  assert.equal((await call('POST', '/auth/google/link', { token: A.token, body: { credential: idToken({ sub: 'g-nueva', email: 'n@x.com' }) } })).status, 200);
  const acc = (await call('GET', '/sync', { token: A.token })).data.account;
  assert.deepEqual([acc.google, acc.email, acc.hasPin], [true, 'n@x.com', true]);
  // entrar con PIN + Google en un paso vincula esa cuenta de Google (y no vale con un PIN malo ni robando la de la pareja)
  assert.equal((await call('POST', '/login', { body: { name: 'Ángel', pin: '9999', credential: idToken({ sub: 'g-otra' }) } })).status, 401);
  assert.equal((await call('POST', '/login', { body: { name: 'Ángel', pin: '1234', credential: idToken({ sub: 'g-ange' }) } })).status, 409);
  assert.equal((await call('POST', '/login', { body: { name: 'Ángel', pin: '1234', credential: idToken({ sub: 'g-otra', email: 'o@x.com' }) } })).status, 200);
  assert.equal((await call('POST', '/auth/google', { body: { credential: idToken({ sub: 'g-otra' }), mode: 'login' } })).status, 200);
});

test('retos: poner, iniciar, enviar evidencia, aprobar o rechazar', async () => {
  const c = (await call('POST', '/challenges', { token: A.token, body: { title: '10 flexiones', points: 20 } })).data.challenge;
  assert.equal(c.to, B.uid);
  assert.equal((await call('POST', '/challenges', { token: A.token, body: { title: '', points: 20 } })).status, 400);
  assert.equal((await call('POST', `/challenges/${c.id}/start`, { token: A.token })).status, 403); // no puede iniciar su propio reto
  assert.equal((await call('POST', `/challenges/${c.id}/start`, { token: B.token })).data.challenge.status, 'started');

  const mp4 = Buffer.from('video-falso-de-prueba');
  assert.equal((await call('POST', `/challenges/${c.id}/evidence`, { token: B.token, raw: mp4, type: 'text/plain' })).status, 400);
  assert.equal((await call('POST', `/challenges/${c.id}/evidence`, { token: B.token, raw: Buffer.alloc(5_100_000), type: 'video/mp4' })).status, 413);
  assert.equal((await call('POST', `/challenges/${c.id}/evidence`, { token: A.token, raw: mp4, type: 'video/mp4' })).status, 403);
  const sent = await call('POST', `/challenges/${c.id}/evidence`, { token: B.token, raw: mp4, type: 'video/mp4' });
  assert.equal(sent.data.challenge.status, 'submitted');
  assert.equal(sent.data.challenge.evidence.kind, 'video');

  const ev = await call('GET', `/challenges/${c.id}/evidence`, { token: A.token });
  assert.deepEqual(ev.data, mp4);
  assert.equal((await call('POST', `/challenges/${c.id}/review`, { token: B.token, body: { action: 'approve' } })).status, 403); // no se auto-aprueba

  const rej = await call('POST', `/challenges/${c.id}/review`, { token: A.token, body: { action: 'reject', note: 'Se ve cortado' } });
  assert.deepEqual([rej.data.challenge.status, rej.data.challenge.note], ['rejected', 'Se ve cortado']);
  await call('POST', `/challenges/${c.id}/evidence`, { token: B.token, raw: mp4, type: 'video/mp4' }); // reintenta
  const ok = await call('POST', `/challenges/${c.id}/review`, { token: A.token, body: { action: 'approve' } });
  assert.equal(ok.data.challenge.status, 'approved');
  assert.equal((await call('POST', `/challenges/${c.id}/cancel`, { token: A.token })).status, 409); // ya aprobado
  const list = (await call('GET', '/sync', { token: B.token })).data.challenges;
  assert.equal(list.find((x) => x.id === c.id).status, 'approved');
});

test('retos: cancelar y foto como evidencia', async () => {
  const c = (await call('POST', '/challenges', { token: B.token, body: { title: 'Plancha 1 minuto', points: 15 } })).data.challenge;
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
  assert.equal((await call('POST', `/challenges/${c.id}/evidence`, { token: A.token, raw: Buffer.from('xx'), type: 'image/jpeg' })).status, 400); // jpeg inválido
  assert.equal((await call('POST', `/challenges/${c.id}/evidence`, { token: A.token, raw: jpeg, type: 'image/jpeg' })).data.challenge.evidence.kind, 'photo');
  assert.equal((await call('POST', `/challenges/${c.id}/cancel`, { token: B.token })).data.challenge.status, 'cancelled');
});

test('tablero de motivación: corazones y borrado solo del autor', async () => {
  const m = (await call('POST', '/messages', { token: A.token, body: { text: 'Eres increíble 💗', kind: 'text' } })).data.message;
  assert.deepEqual((await call('POST', `/messages/${m.id}/like`, { token: B.token })).data.message.likes, [B.uid]);
  assert.deepEqual((await call('POST', `/messages/${m.id}/like`, { token: B.token })).data.message.likes, []); // alterna
  assert.equal((await call('POST', `/messages/${m.id}/delete`, { token: B.token })).status, 403);
  assert.equal((await call('POST', `/messages/${m.id}/delete`, { token: A.token })).status, 200);
  assert.equal((await call('GET', '/sync', { token: A.token })).data.messages.some((x) => x.id === m.id), false);
});

test('“hoy no voy”: la nota llega a la pareja como tipo skip y el documento con skips y suplementos se guarda', async () => {
  assert.equal((await call('POST', '/messages', { token: A.token, body: { text: 'sin fecha', kind: 'skip' } })).status, 400);
  const r = await call('POST', '/messages', { token: A.token, body: { text: 'No fui porque me dio flojera', kind: 'skip', ref: { uid: 'otro', date: '2026-10-06' } } });
  assert.equal(r.data.message.kind, 'skip');
  assert.equal(r.data.message.ref.uid, A.uid); // la fecha es suya, el uid no se falsifica
  const id = r.data.message.id;
  assert.equal((await call('POST', `/messages/${id}/penalty`, { token: A.token, body: { points: 10 } })).status, 403); // lo decide la pareja
  assert.equal((await call('POST', `/messages/${id}/penalty`, { token: B.token, body: { points: 0 } })).status, 400);
  assert.equal((await call('POST', `/messages/${id}/penalty`, { token: B.token, body: { points: 101 } })).status, 400);
  const dec = await call('POST', `/messages/${id}/penalty`, { token: B.token, body: { points: 15 } });
  assert.equal(dec.data.message.penalty.points, 15);
  assert.equal((await call('POST', `/messages/${id}/penalty`, { token: B.token, body: { points: 20 } })).status, 409); // una sola vez
  assert.equal((await call('GET', '/sync', { token: A.token })).data.messages.find((x) => x.id === id).penalty.points, 15);
  const seen = (await call('GET', '/sync', { token: B.token })).data.messages.find((x) => x.id === r.data.message.id);
  assert.equal(seen.kind, 'skip');
  const me = (await call('GET', '/sync', { token: A.token })).data.me;
  me.skips = { '2026-10-06': { reason: 'flojera', ts: 1 } };
  me.suppLog = { '2026-10-06': ['creatina'] };
  me.updatedAt += 1;
  assert.equal((await call('PUT', '/me', { token: A.token, body: { doc: me } })).status, 200);
  const partnerView = (await call('GET', '/sync', { token: B.token })).data.partner.doc;
  assert.deepEqual(partnerView.suppLog['2026-10-06'], ['creatina']);
  assert.equal(partnerView.skips['2026-10-06'].reason, 'flojera');
});
