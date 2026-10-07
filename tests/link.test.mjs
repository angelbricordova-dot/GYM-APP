import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-link-'));
delete process.env.SETUP_CODE;
const { default: api } = await import('../server/handler.mjs');

const call = async (method, path, { token, body, raw, type } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !raw) headers['content-type'] = 'application/json';
  if (type) headers['content-type'] = type;
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }));
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};
const PACT = 'acepto mi amor te amo mucho';
const sync = async (u) => (await call('GET', '/sync', { token: u.token })).data;
let A, B, C, inviteA;
const day = new Date().toISOString().slice(0, 10);

test('preparar: pareja A+B con un reto aprobado y un “hoy no fui” penalizado', async () => {
  A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data; inviteA = A.inviteCode;
  B = (await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: inviteA, pact: PACT } })).data;
  // B pone su documento con un “hoy no fui”
  const me = (await sync(B)).me;
  me.skips = { [day]: { reason: 'flojera', ts: 1 } }; me.updatedAt += 1;
  await call('PUT', '/me', { token: B.token, body: { doc: me } });
  const sk = (await call('POST', '/messages', { token: B.token, body: { text: 'flojera', kind: 'skip', ref: { date: day } } })).data.message;
  await call('POST', `/messages/${sk.id}/penalty`, { token: A.token, body: { points: 15 } });
  // A le pone un reto a B y lo aprueba
  const c = (await call('POST', '/challenges', { token: A.token, body: { title: '10 flexiones', points: 30 } })).data.challenge;
  await call('POST', `/challenges/${c.id}/evidence`, { token: B.token, raw: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]), type: 'image/jpeg' });
  await call('POST', `/challenges/${c.id}/review`, { token: A.token, body: { action: 'approve' } });
  assert.equal((await sync(B)).challenges[0].status, 'approved');
});

test('desvincularse: conserva puntos, borra lo compartido y renueva los códigos', async () => {
  assert.equal((await call('POST', '/me/leave', { token: B.token })).status, 200);
  const sb = await sync(B), sa = await sync(A);
  assert.equal(sb.partner, null); assert.equal(sa.partner, null);
  for (const s of [sa, sb]) { assert.equal(s.messages.length, 0); assert.equal(s.challenges.length, 0); assert.equal(s.routines.length, 0); }
  assert.match(sb.inviteCode, /^[A-Z0-9]{6}$/); assert.match(sa.inviteCode, /^[A-Z0-9]{6}$/);
  assert.notEqual(sa.inviteCode, inviteA); assert.notEqual(sb.inviteCode, sa.inviteCode);
  // los puntos ya ganados quedan fijados en el documento de B (+30 del reto, −15 de la penalización)
  const bank = (sb.me || (await sync({ token: B.token })).me);
  const full = (await call('GET', '/sync?meAt=0', { token: B.token })).data.me;
  const pts = Object.fromEntries(full.ledger.filter((e) => e.key?.startsWith('bank:')).map((e) => [e.key.split(':')[1], e.delta]));
  assert.equal(pts.challenge, 30); assert.equal(pts.skip, -15);
  assert.ok(bank);
  // el código viejo ya no sirve, y salir sin pareja no se puede
  assert.equal((await call('GET', `/invite?code=${inviteA}`)).status, 403);
  assert.equal((await call('POST', '/me/leave', { token: B.token })).status, 409);
});

test('un segundo espacio (otra persona) solo se crea con SETUP_CODE y los nombres no se repiten', async () => {
  assert.equal((await call('POST', '/setup', { body: { name: 'Mateo', pin: '1111' } })).status, 409); // sin SETUP_CODE no hay más espacios
  assert.equal((await call('GET', '/status')).data.canCreate, false);
  process.env.SETUP_CODE = 'clave';
  assert.equal((await call('GET', '/status')).data.canCreate, true);
  assert.equal((await call('POST', '/setup', { body: { name: 'Mateo', pin: '1111', setupCode: 'mal' } })).status, 403);
  assert.equal((await call('POST', '/setup', { body: { name: 'angel', pin: '1111', setupCode: 'clave' } })).status, 409); // ya hay un Ángel
  C = (await call('POST', '/setup', { body: { name: 'Mateo', pin: '1111', setupCode: 'clave' } })).data;
  assert.equal(C.inviteCode.length, 6);
  assert.equal((await call('POST', '/login', { body: { name: 'Mateo', pin: '1111' } })).status, 200);
});

test('unirse a otra persona con su código: ya con cuenta y sin pareja', async () => {
  const mineB = (await sync(B)).inviteCode;
  assert.equal((await call('POST', '/me/join', { token: B.token, body: { inviteCode: mineB, pact: PACT } })).status, 409); // su propio código
  assert.equal((await call('POST', '/me/join', { token: B.token, body: { inviteCode: 'NOPE12', pact: PACT } })).status, 403);
  assert.equal((await call('POST', '/me/join', { token: B.token, body: { inviteCode: C.inviteCode, pact: 'no' } })).status, 400);
  assert.equal((await call('POST', '/me/join', { token: B.token, body: { inviteCode: C.inviteCode, pact: PACT } })).status, 200);
  const sb = await sync(B), sc = await sync(C), sa = await sync(A);
  assert.equal(sb.partner.name, 'Mateo'); assert.equal(sc.partner.name, 'Angélica'); assert.equal(sa.partner, null);
  assert.equal(sb.inviteCode, null);
  assert.equal(sb.messages.length, 1); assert.equal(sc.messages.length, 1); // la nota de aceptación, solo en ese espacio
  assert.equal(sa.messages.length, 0);
  // con pareja no se puede unir a otra sin desvincularse
  assert.equal((await call('POST', '/me/join', { token: B.token, body: { inviteCode: sa.inviteCode, pact: PACT } })).status, 409);
});

test('los espacios no se ven entre sí (fotos, retos, mensajes)', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
  await call('POST', '/photo?id=abcdef12', { token: B.token, raw: jpeg, type: 'image/jpeg' });
  assert.equal((await call('GET', `/photo/${B.uid}/abcdef12`, { token: C.token })).status, 200); // su pareja sí
  assert.equal((await call('GET', `/photo/${B.uid}/abcdef12`, { token: A.token })).status, 404); // alguien de otro espacio no
  const msg = (await sync(C)).messages[0];
  assert.equal((await call('POST', `/messages/${msg.id}/like`, { token: A.token })).status, 404);
  const ch = (await call('POST', '/challenges', { token: C.token, body: { title: 'plancha', points: 10 } })).data.challenge;
  assert.equal((await call('POST', `/challenges/${ch.id}/cancel`, { token: A.token })).status, 404);
  assert.equal((await call('GET', `/challenges/${ch.id}/evidence`, { token: A.token })).status, 404);
  assert.equal((await call('POST', '/challenges', { token: A.token, body: { title: 'x', points: 10 } })).status, 409); // A está sin pareja
});

test('eliminar mi usuario libera mi lugar y renueva el código del espacio', async () => {
  const before = (await sync(C)).inviteCode;
  assert.equal(before, null); // C tiene pareja
  assert.equal((await call('POST', '/me/delete', { token: B.token })).status, 200);
  const sc = await sync(C);
  assert.equal(sc.partner, null);
  assert.match(sc.inviteCode, /^[A-Z0-9]{6}$/);
  assert.equal((await call('POST', '/login', { body: { name: 'Angélica', pin: '4321' } })).status, 401);
});
