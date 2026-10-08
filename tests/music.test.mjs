import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-music-'));
delete process.env.SETUP_CODE;
const { default: api } = await import('../server/handler.mjs');
const { _net } = await import('../server/music.mjs');
const { parseMusicLink } = await import('../app/js/music-links.js');

const call = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

// YouTube simulado
_net.fetch = async (url) => (String(url).includes('youtube.com/oembed')
  ? new Response(JSON.stringify({ title: 'Un video', author_name: 'Canal', thumbnail_url: 'https://i.ytimg.com/x.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } })
  : new Response('{}', { status: 404 }));

let A, B;
test('enlaces: YouTube y YouTube Music (y lo que no sirve)', () => {
  assert.equal(parseMusicLink('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM').url, 'https://music.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(parseMusicLink('https://youtu.be/dQw4w9WgXcQ?t=3').embed, 'https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0');
  assert.equal(parseMusicLink('https://www.youtube.com/playlist?list=PLabcdefghij123').kind, 'playlist');
  for (const bad of ['', 'hola', 'http://youtu.be/dQw4w9WgXcQ', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'javascript:alert(1)']) assert.equal(parseMusicLink(bad), null, bad);
});

test('preparar: pareja', async () => {
  A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data;
  B = (await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: A.inviteCode, pact: 'acepto mi amor te amo mucho' } })).data;
  assert.ok(A.token && B.token);
});

test('reproducir un enlace dentro de la app: se guarda, cuenta como escuchando y se puede dejar', async () => {
  assert.equal((await call('POST', '/music/play', { token: A.token, body: { url: 'https://evil.com/x' } })).status, 400);
  assert.equal((await call('GET', '/music/partner', { token: B.token })).data.partner.now, null);
  const r = await call('POST', '/music/play', { token: A.token, body: { url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ' } });
  assert.deepEqual([r.data.item.title, r.data.item.artist, r.data.item.service], ['Un video', 'Canal', 'youtube']);
  const seen = (await call('GET', '/music/partner', { token: B.token })).data.partner;
  assert.deepEqual([seen.name, seen.now.title, seen.now.live], ['Ángel', 'Un video', true]);
  const hist = (await call('GET', '/music/me', { token: A.token })).data;
  assert.equal(hist.items[0].url, 'https://music.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal((await call('GET', '/music/me', { token: B.token })).data.items.length, 0); // el historial es de cada quien
  await call('POST', '/music/stop', { token: A.token });
  const after = (await call('GET', '/music/partner', { token: B.token })).data.partner;
  assert.equal(after.now, null);
  assert.equal(after.last.title, 'Un video'); // queda como “lo último”
});

test('sin rutas de Spotify', async () => {
  assert.equal((await call('POST', '/spotify/start', { token: A.token, body: {} })).status, 404);
});
