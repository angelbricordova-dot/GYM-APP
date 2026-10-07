import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-mig-'));
delete process.env.SETUP_CODE;
const { default: api } = await import('../server/handler.mjs');
const { createStorage } = await import('../server/storage.mjs');
const db = createStorage();

const call = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};

test('datos de antes (un solo espacio, sin `space`) siguen funcionando y se migran al leer', async () => {
  const A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data;
  const B = (await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: A.inviteCode, pact: 'acepto mi amor te amo mucho' } })).data;
  await call('POST', '/messages', { token: A.token, body: { text: 'hola', kind: 'text' } });
  // se vuelve al formato viejo
  const meta = await db.get('meta');
  meta.inviteCode = meta.spaces[0].inviteCode;
  delete meta.spaces;
  await db.set('meta', meta);
  for (const k of await db.list('message/')) { const m = await db.get(k); delete m.space; await db.set(k, m); }

  const sa = (await call('GET', '/sync', { token: A.token })).data;
  assert.equal(sa.partner.name, 'Angélica');
  assert.equal(sa.messages.length, 2); // hola + la aceptación
  assert.equal((await call('GET', '/sync', { token: B.token })).data.messages.length, 2);
  assert.equal((await db.get('meta')).spaces[0].id, 'main');
  // y se puede desvincular normalmente
  assert.equal((await call('POST', '/me/leave', { token: B.token })).status, 200);
  assert.equal((await call('GET', '/sync', { token: A.token })).data.messages.length, 0);
});
