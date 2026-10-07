import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-hist-'));
delete process.env.SETUP_CODE;
const { default: api } = await import('../server/handler.mjs');

const call = async (method, path, { token, body, raw, type } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !raw) headers['content-type'] = 'application/json';
  if (type) headers['content-type'] = type;
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }));
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const sync = async (u) => (await call('GET', '/sync?meAt=0', { token: u.token })).data;
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
let A, B;

test('preparar: pareja con retos, notas, premios y rutinas', async () => {
  A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data;
  B = (await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: A.inviteCode, pact: 'acepto mi amor te amo mucho' } })).data;
  // reto aprobado (B gana 30), reto cancelado y reto activo
  const ok = (await call('POST', '/challenges', { token: A.token, body: { title: 'aprobado', points: 30 } })).data.challenge;
  await call('POST', `/challenges/${ok.id}/evidence`, { token: B.token, raw: jpeg, type: 'image/jpeg' });
  await call('POST', `/challenges/${ok.id}/review`, { token: A.token, body: { action: 'approve' } });
  const cancel = (await call('POST', '/challenges', { token: A.token, body: { title: 'cancelado', points: 5 } })).data.challenge;
  await call('POST', `/challenges/${cancel.id}/cancel`, { token: A.token });
  await call('POST', '/challenges', { token: A.token, body: { title: 'activo', points: 10 } });
  // “hoy no fui” decidido (−15) y otro sin decidir
  const me = (await sync(B)).me;
  me.skips = { '2026-01-02': { reason: 'a', ts: 1 }, '2026-01-03': { reason: 'b', ts: 1 } }; me.updatedAt += 1;
  await call('PUT', '/me', { token: B.token, body: { doc: me } });
  const s1 = (await call('POST', '/messages', { token: B.token, body: { text: 'a', kind: 'skip', ref: { date: '2026-01-02' } } })).data.message;
  await call('POST', `/messages/${s1.id}/penalty`, { token: A.token, body: { points: 15 } });
  await call('POST', '/messages', { token: B.token, body: { text: 'b', kind: 'skip', ref: { date: '2026-01-03' } } });
  await call('POST', '/messages', { token: A.token, body: { text: 'hola', kind: 'text' } });
  // premios: uno rechazado, uno aceptado con cupón cumplido
  const pr = (await call('POST', '/proposals', { token: A.token, body: { name: 'no', cost: 10 } })).data.proposal;
  await call('POST', `/proposals/${pr.id}`, { token: B.token, body: { action: 'decline' } });
  const pa = (await call('POST', '/proposals', { token: A.token, body: { name: 'sí', cost: 10 } })).data.proposal;
  await call('POST', `/proposals/${pa.id}`, { token: B.token, body: { action: 'accept' } });
  const v = (await call('POST', '/vouchers', { token: B.token, body: { proposalId: pa.id } })).data.voucher;
  await call('POST', `/vouchers/${v.id}/done`, { token: A.token });
  // rutinas: una vista y una nueva
  const r1 = (await call('POST', '/routines', { token: A.token, body: { name: 'vista', exercises: ['x'] } })).data.routine;
  await call('POST', `/routines/${r1.id}/seen`, { token: B.token });
  await call('POST', '/routines', { token: A.token, body: { name: 'nueva', exercises: ['y'] } });
});

test('borrar historial de retos: se van los terminados, el activo se queda y los puntos se conservan', async () => {
  assert.equal((await call('POST', '/history/clear', { token: A.token, body: { kinds: [] } })).status, 400);
  const r = await call('POST', '/history/clear', { token: A.token, body: { kinds: ['challenges'] } });
  assert.deepEqual([r.status, r.data.deleted.challenge], [200, 2]);
  const s = await sync(B);
  assert.deepEqual(s.challenges.map((c) => c.title), ['activo']);
  const bank = s.me.ledger.filter((e) => e.key?.startsWith('bank:'));
  assert.deepEqual(bank.map((e) => [e.key.split(':')[1], e.delta]), [['challenge', 30]]); // +30 fijados para B
  assert.equal((await sync(A)).challenges.length, 1); // también para A
});

test('borrar notas, premios y rutinas; los “hoy no fui” sin decidir se quedan y la penalización se fija', async () => {
  const r = await call('POST', '/history/clear', { token: B.token, body: { kinds: ['notes', 'prizes', 'routines'] } });
  assert.equal(r.status, 200);
  const s = await sync(A);
  assert.equal(s.messages.length, 1); assert.equal(s.messages[0].text, 'b'); // el sin decidir
  assert.equal(s.proposals.filter((p) => p.status === 'declined').length, 0);
  assert.equal(s.proposals.filter((p) => p.status === 'accepted').length, 1); // el premio activo sigue
  assert.equal(s.vouchers.length, 0);
  assert.deepEqual(s.routines.map((x) => x.name), ['nueva']);
  const bank = (await sync(B)).me.ledger.filter((e) => e.key?.startsWith('bank:')).map((e) => [e.key.split(':').slice(1).join(':'), e.delta]);
  assert.ok(bank.some(([k, d]) => k === 'skip:2026-01-02' && d === -15));
  assert.ok(bank.some(([k, d]) => k.startsWith('challenge') && d === 30));
});
