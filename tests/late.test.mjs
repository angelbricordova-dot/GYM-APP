import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-late-'));
delete process.env.SETUP_CODE;
const { default: api, runReminders, _push } = await import('../server/handler.mjs');

const sent = [];
_push.send = async (sub, payload) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); return { statusCode: 201 }; };
const call = async (method, path, { token, body, raw, type } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !raw) headers['content-type'] = 'application/json';
  if (type) headers['content-type'] = type;
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }));
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const bal = async (u) => (await call('GET', '/sync', { token: u.token })).data.me.ledger.reduce((s, e) => s + e.delta, 0);
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let A, B;

test('preparar', async () => {
  A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data;
  B = (await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: A.inviteCode, pact: 'acepto mi amor te amo mucho' } })).data;
  await call('POST', '/push/subscribe', { token: B.token, body: { subscription: { endpoint: 'https://push.example/B', keys: { p256dh: 'BPkB', auth: 'auB' } } } });
});

test('recordar un reto: solo quien lo puso, con fecha válida, y le llega una notificación', async () => {
  const c = (await call('POST', '/challenges', { token: A.token, body: { title: '30 abdominales', points: 20 } })).data.challenge;
  const remind = (who, date) => call('POST', `/challenges/${c.id}/remind`, { token: who.token, body: { date } });
  assert.equal((await remind(B, day(1))).status, 403); // ella no se lo recuerda a sí misma
  assert.equal((await remind(A, 'mañana')).status, 400);
  assert.equal((await remind(A, day(-3))).status, 400); // ya pasó
  assert.equal((await remind(A, day(90))).status, 400); // muy lejos
  sent.length = 0;
  const r = await remind(A, day(1));
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.challenge.reminder.date, r.data.challenge.reminder.settled], [day(1), null]);
  assert.match(sent.at(-1).title, /te recuerda/);
  assert.match(sent.at(-1).body, /30 abdominales/);
  assert.match(sent.at(-1).body, /5 puntos/);
  assert.equal((await remind(A, day(2))).status, 200); // se puede cambiar el límite

  // vencido y sin cumplir → −5 una sola vez
  const before = await bal(B);
  await runReminders(new Date(Date.now() + 5 * 864e5));
  assert.equal(await bal(B), before - 5);
  await runReminders(new Date(Date.now() + 6 * 864e5));
  assert.equal(await bal(B), before - 5); // no se repite
  const after = (await call('GET', '/sync', { token: A.token })).data.challenges.find((x) => x.id === c.id);
  assert.equal(after.reminder.settled, 'late');
  assert.equal((await remind(A, day(9))).status, 409); // ya venció
  assert.match(sent.at(-2).title + sent.at(-1).title, /Se acabó el tiempo|no cumplió/);
});

test('si lo cumple a tiempo no pierde puntos', async () => {
  const c = (await call('POST', '/challenges', { token: A.token, body: { title: 'Plancha', points: 10 } })).data.challenge;
  await call('POST', `/challenges/${c.id}/remind`, { token: A.token, body: { date: day(1) } });
  await call('POST', `/challenges/${c.id}/evidence`, { token: B.token, raw: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]), type: 'image/jpeg' });
  const before = await bal(B);
  await runReminders(new Date(Date.now() + 5 * 864e5));
  assert.equal(await bal(B), before);
  assert.equal((await call('GET', '/sync', { token: B.token })).data.challenges.find((x) => x.id === c.id).reminder.settled, 'met');
});

test('si se cancela el reto no hay castigo, y al sincronizar también se aplican los vencidos', async () => {
  const c = (await call('POST', '/challenges', { token: A.token, body: { title: 'Saltos', points: 10 } })).data.challenge;
  await call('POST', `/challenges/${c.id}/remind`, { token: A.token, body: { date: day(1) } });
  await call('POST', `/challenges/${c.id}/cancel`, { token: A.token });
  const before = await bal(B);
  await runReminders(new Date(Date.now() + 5 * 864e5));
  assert.equal(await bal(B), before);
});
