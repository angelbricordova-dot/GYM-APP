import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'gymduo-'));
const { default: api } = await import('../server/handler.mjs');

const call = async (method, path, { token, body, raw } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !raw) headers['content-type'] = 'application/json';
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }));
  const type = res.headers.get('content-type') || '';
  return { status: res.status, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};

let A, B, invite;

test('crear espacio, unirse con código y límite de 2 personas', async () => {
  assert.equal((await call('GET', '/status')).data.setup, false);
  assert.equal((await call('POST', '/setup', { body: { name: 'Ángel', pin: '12' } })).status, 400);
  const s = await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } });
  assert.equal(s.status, 200);
  A = s.data; invite = s.data.inviteCode;
  assert.equal((await call('POST', '/setup', { body: { name: 'X', pin: '1234' } })).status, 409);
  assert.equal((await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: 'NOPE', pact: 'acepto mi amor te amo mucho' } })).status, 403);
  assert.equal((await call('POST', '/join', { body: { name: 'ángel', pin: '4321', inviteCode: invite, pact: 'acepto mi amor te amo mucho' } })).status, 409);
  const j = await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: invite.toLowerCase(), pact: 'Acepto mi amor, te amo mucho' } });
  assert.equal(j.status, 200);
  B = j.data;
  assert.equal((await call('POST', '/join', { body: { name: 'Otra', pin: '1111', inviteCode: invite, pact: 'acepto mi amor te amo mucho' } })).status, 409);
});

test('login, PIN incorrecto y bloqueo tras 5 intentos', async () => {
  assert.equal((await call('POST', '/login', { body: { name: 'angélica', pin: '4321' } })).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/login', { body: { name: 'Ángel', pin: '0000' } })).status, 401);
  assert.equal((await call('POST', '/login', { body: { name: 'Ángel', pin: '1234' } })).status, 429);
});

test('sin token no hay acceso', async () => {
  assert.equal((await call('GET', '/sync')).status, 401);
  assert.equal((await call('GET', '/sync', { token: 'a.b' })).status, 401);
});

test('documento propio, vista de la pareja y privacidad del peso', async () => {
  const sync = await call('GET', '/sync', { token: A.token });
  assert.equal(sync.data.inviteCode, null); // ya se unió
  const doc = { ...sync.data.me, weights: [{ date: '2026-10-01', kg: 80 }], checkins: { '2026-10-01': { ts: 1, time: '18:00', photo: 'abc-123456' } }, updatedAt: Date.now() + 10 };
  assert.equal((await call('PUT', '/me', { token: A.token, body: { doc } })).status, 200);
  const view = await call('GET', '/sync', { token: B.token });
  assert.equal(view.data.partner.name, 'Ángel');
  assert.deepEqual(view.data.partner.doc.weights, []); // privado por defecto
  assert.ok(view.data.partner.doc.checkins['2026-10-01']);
  await call('PUT', '/me', { token: A.token, body: { doc: { ...doc, shareWeight: true, updatedAt: Date.now() + 20 } } });
  assert.equal((await call('GET', '/sync', { token: B.token })).data.partner.doc.weights.length, 1);
  const stale = await call('PUT', '/me', { token: A.token, body: { doc: { ...doc, updatedAt: 1 } } });
  assert.equal(stale.status, 409);
  // sincronización condicional: sin cambios no manda el documento
  const again = await call('GET', `/sync?partnerAt=${view.data.partner.updatedAt + 999}`, { token: B.token });
  assert.equal(again.data.partner.doc, null);
});

test('fotos: solo JPEG, ambas personas pueden verlas', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  assert.equal((await call('POST', '/photo?id=abc-123456', { token: A.token, raw: jpeg })).status, 200);
  assert.equal((await call('POST', '/photo?id=bad', { token: A.token, raw: jpeg })).status, 400);
  assert.equal((await call('POST', '/photo?id=abc-654321', { token: A.token, raw: Buffer.from('hola') })).status, 400);
  const got = await call('GET', `/photo/${A.uid}/abc-123456`, { token: B.token });
  assert.equal(got.status, 200);
  assert.deepEqual(got.data, jpeg);
  assert.equal((await call('GET', `/photo/${A.uid}/abc-123456`)).status, 401);
});

test('propuestas: proponer, contraoferta y aceptar solo la otra persona', async () => {
  const p = (await call('POST', '/proposals', { token: A.token, body: { name: 'Ver una película', emoji: '🎬', cost: 50 } })).data.proposal;
  assert.equal(p.status, 'pending');
  assert.equal((await call('POST', `/proposals/${p.id}`, { token: A.token, body: { action: 'accept' } })).status, 403); // no puede aceptar la suya
  const counter = await call('POST', `/proposals/${p.id}`, { token: B.token, body: { action: 'counter', cost: 80 } });
  assert.equal(counter.data.proposal.cost, 80);
  assert.equal((await call('POST', `/proposals/${p.id}`, { token: B.token, body: { action: 'accept' } })).status, 403); // ahora le toca a A
  const ok = await call('POST', `/proposals/${p.id}`, { token: A.token, body: { action: 'accept' } });
  assert.equal(ok.data.proposal.status, 'accepted');
  assert.equal((await call('POST', `/proposals/${p.id}`, { token: B.token, body: { action: 'decline' } })).status, 409);

  const v = (await call('POST', '/vouchers', { token: B.token, body: { proposalId: p.id } })).data.voucher;
  assert.equal(v.cost, 80);
  assert.equal(v.status, 'open');
  // quien canjeó (B) no puede marcarse el premio como hecho; lo cumple A, y B confirma que sí fue verdad
  const act = (who, a) => call('POST', `/vouchers/${v.id}/${a}`, { token: who.token });
  assert.equal((await act(B, 'claim')).status, 403);
  assert.equal((await act(A, 'confirm')).status, 403); // A no puede darse por cumplido solo
  assert.equal((await act(A, 'reject')).status, 403);
  // “Lo haré más tarde”: solo quien lo cumple, con una fecha válida; no cambia el estado
  const later = (who, date) => call('POST', `/vouchers/${v.id}/later`, { token: who.token, body: { date } });
  assert.equal((await later(B, '2099-01-01')).status, 403);
  assert.equal((await later(A, 'mañana')).status, 400);
  assert.equal((await later(A, '2001-01-01')).status, 400);
  assert.equal((await later(A, '2099-01-01')).status, 400); // demasiado lejos
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const snoozed = await later(A, soon);
  assert.deepEqual([snoozed.data.voucher.status, snoozed.data.voucher.later.date], ['open', soon]);
  assert.equal((await act(A, 'claim')).data.voucher.status, 'claimed'); // “lo hice”
  assert.equal((await call('GET', '/sync', { token: A.token })).data.vouchers.find((x) => x.id === v.id).later, undefined); // al cumplirlo se borra la fecha
  assert.equal((await later(A, soon)).status, 409);
  assert.equal((await act(A, 'claim')).status, 409);
  assert.equal((await act(A, 'deny')).status, 403); // solo quien canjeó lo puede negar
  assert.equal((await act(B, 'reject')).data.voucher.status, 'open'); // “todavía no”
  assert.equal((await act(B, 'deny')).status, 409); // no hay nada reclamado
  await act(A, 'claim');
  const balA = async () => (await call('GET', '/sync', { token: A.token })).data.me.ledger.reduce((s, e) => s + e.delta, 0);
  const before = await balA();
  const denied = await act(B, 'deny'); // “no, no lo hizo”: A mintió
  assert.deepEqual([denied.data.voucher.status, denied.data.voucher.lies.length], ['open', 1]);
  assert.equal(await balA(), before - 5); // −5 por mentir
  assert.equal((await act(A, 'claim')).data.voucher.status, 'claimed');
  assert.equal((await call('POST', `/vouchers/${v.id}/done`, { token: A.token })).status, 409); // la ruta vieja tampoco deja que A lo cierre
  assert.equal((await act(B, 'confirm')).data.voucher.status, 'done'); // sí fue verdad
  assert.equal((await act(B, 'confirm')).status, 409);
  const sync = (await call('GET', '/sync', { token: A.token })).data;
  assert.equal(sync.proposals.length, 1);
  assert.equal(sync.vouchers[0].status, 'done');
});

test('mensajes', async () => {
  assert.equal((await call('POST', '/messages', { token: A.token, body: { text: '' } })).status, 400);
  await call('POST', '/messages', { token: A.token, body: { text: '¡Tú puedes! 💪', kind: 'cheer' } });
  const sync = (await call('GET', '/sync', { token: B.token })).data;
  assert.equal(sync.messages.at(-1).text, '¡Tú puedes! 💪');
});
