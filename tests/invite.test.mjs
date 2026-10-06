import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-inv-'));
const { default: api } = await import('../server/handler.mjs');
const L = await import('../app/js/logic.js');

const call = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const PACT = 'acepto mi amor te amo mucho';
let A, code;

test('el código nuevo no usa letras ni números que se confundan', async () => {
  for (const c of 'S5Z2B8O0I1') assert.ok(!L.INVITE_ALPHABET.includes(c), `${c} no debería estar`);
  A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data;
  code = A.inviteCode;
  assert.match(code, new RegExp(`^[${L.INVITE_ALPHABET}]{6}$`));
});

test('canon: las parejas confusas y las minúsculas valen igual', () => {
  assert.equal(L.canonInvite('uqz5e5'), L.canonInvite('UQ2SE5'));
  assert.equal(L.canonInvite('  b0i  '), L.canonInvite('8O1'));
  assert.notEqual(L.canonInvite('ABCDEF'), L.canonInvite('ABCDEG'));
});

test('/invite: valida el código y dice quién invita, sin gastarlo', async () => {
  const ok = await call('GET', `/invite?code=${code.toLowerCase()}`);
  assert.deepEqual([ok.status, ok.data.inviter], [200, 'Ángel']);
  assert.equal((await call('GET', `/invite?code=${code}`)).status, 200); // se puede consultar varias veces
  assert.equal((await call('GET', '/invite?code=NOPE12')).status, 403);
});

test('la frase de aceptación: sin acentos, signos ni mayúsculas; si no, no entra', async () => {
  assert.ok(L.pactOk('Acepto mi amor, te amo mucho'));
  assert.ok(L.pactOk('  ACEPTO   MI AMOR  TE AMO MUCHO!! '));
  assert.ok(!L.pactOk('acepto mi amor'));
  assert.ok(!L.pactOk(''));
  const base = { name: 'Angélica', pin: '4321', inviteCode: code };
  assert.equal((await call('POST', '/join', { body: base })).status, 400); // sin frase
  const bad = await call('POST', '/join', { body: { ...base, pact: 'te amo' } });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /acepto mi amor te amo mucho/);
});

test('unirse con el código (aunque se lea mal) y con la frase crea su cuenta y la primera nota', async () => {
  const sloppy = code.replace(/[A-Z]/, (c) => c); // el código tal cual, en minúsculas
  const j = await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: sloppy.toLowerCase(), pact: 'Acepto mi amor, te amo mucho' } });
  assert.equal(j.status, 200);
  const sync = (await call('GET', '/sync', { token: A.token })).data;
  assert.equal(sync.partner.name, 'Angélica');
  assert.equal(sync.messages[0].text, 'Acepto, mi amor. Te amo mucho 💗');
  assert.equal(sync.messages[0].from, j.data.uid);
  assert.equal((await call('GET', `/invite?code=${code}`)).status, 409); // el espacio ya está completo
});

test('freno anti-adivinanza: 8 códigos incorrectos bloquean 10 minutos', async () => {
  // se borra a la pareja para volver a tener un espacio con lugar libre
  const login = (await call('POST', '/login', { body: { name: 'Angélica', pin: '4321' } })).data;
  await call('POST', '/me/delete', { token: login.token });
  const fresh = (await call('GET', '/sync', { token: A.token })).data.inviteCode;
  for (let i = 0; i < 8; i++) assert.equal((await call('GET', '/invite?code=AAAAAA')).status, 403);
  assert.equal((await call('GET', '/invite?code=AAAAAA')).status, 429);
  assert.equal((await call('GET', `/invite?code=${fresh}`)).status, 429); // incluso el correcto espera
});
