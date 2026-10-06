import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-rec-'));
delete process.env.SETUP_CODE;
const { default: api } = await import('../server/handler.mjs');

const call = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const PACT = 'acepto mi amor te amo mucho';
let A;

test('sin SETUP_CODE definido no hay recuperación (nadie puede apoderarse del espacio)', async () => {
  A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data;
  const r = await call('POST', '/recover', { body: { setupCode: '', action: 'list' } });
  assert.equal(r.status, 403);
  assert.equal((await call('POST', '/recover', { body: { action: 'pin', name: 'Ángel', pin: '9999' } })).status, 403);
  assert.equal((await call('POST', '/login', { body: { name: 'Ángel', pin: '9999' } })).status, 401);
});

test('con SETUP_CODE: lista nombres, cambia el PIN, y se bloquea al adivinar', async () => {
  process.env.SETUP_CODE = 'secreto-del-sitio';
  await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: A.inviteCode, pact: PACT } });
  assert.equal((await call('POST', '/recover', { body: { setupCode: 'mal', action: 'list' } })).status, 403);
  const l = await call('POST', '/recover', { body: { setupCode: 'secreto-del-sitio', action: 'list' } });
  assert.deepEqual(l.data.names, ['Ángel', 'Angélica']);
  assert.equal((await call('POST', '/recover', { body: { setupCode: 'secreto-del-sitio', action: 'pin', name: 'Nadie', pin: '5555' } })).status, 404);
  assert.equal((await call('POST', '/recover', { body: { setupCode: 'secreto-del-sitio', action: 'pin', name: 'Ángel', pin: '12' } })).status, 400);
  const r = await call('POST', '/recover', { body: { setupCode: 'secreto-del-sitio', action: 'pin', name: 'angel', pin: '5555' } });
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/sync', { token: r.data.token })).status, 200);
  assert.equal((await call('POST', '/login', { body: { name: 'Ángel', pin: '1234' } })).status, 401); // el PIN viejo ya no sirve
  assert.equal((await call('POST', '/login', { body: { name: 'ANGEL', pin: '5555' } })).status, 200);
  for (let i = 0; i < 8; i++) await call('POST', '/recover', { body: { setupCode: 'x', action: 'list' } });
  assert.equal((await call('POST', '/recover', { body: { setupCode: 'secreto-del-sitio', action: 'list' } })).status, 429);
});

test('borrar todo: pide BORRAR, deja el espacio libre para crearse de nuevo', async () => {
  const meta = JSON.parse(JSON.stringify((await call('GET', '/status')).data));
  assert.equal(meta.setup, true);
  // el freno de intentos de la prueba anterior sigue activo: se levanta quitando el espacio con otro handler no es posible, así que se espera con tiempo simulado
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60_000;
  try {
    assert.equal((await call('POST', '/recover', { body: { setupCode: 'secreto-del-sitio', action: 'wipe', confirm: 'no' } })).status, 400);
    assert.equal((await call('POST', '/recover', { body: { setupCode: 'secreto-del-sitio', action: 'wipe', confirm: 'borrar' } })).status, 200);
  } finally { Date.now = realNow; }
  assert.deepEqual((await call('GET', '/status')).data.setup, false);
  const again = await call('POST', '/setup', { body: { name: 'Ángel', pin: '1111', setupCode: 'secreto-del-sitio' } });
  assert.equal(again.status, 200);
});
