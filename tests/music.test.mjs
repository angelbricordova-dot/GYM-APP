import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-music-'));
process.env.SPOTIFY_CLIENT_ID = 'cid123';
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

// Spotify y YouTube simulados
const calls = [];
let playing = { is_playing: true, currently_playing_type: 'track', item: { id: 'T1', name: 'Canción uno', artists: [{ name: 'Ella' }], album: { images: [{ url: 'https://i.scdn.co/a' }] }, external_urls: { spotify: 'https://open.spotify.com/track/T1aaaaaaaaaaaa' } } };
_net.fetch = async (url, opts = {}) => {
  url = String(url); calls.push(url);
  const j = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://accounts.spotify.com/api/token')) {
    const b = String(opts.body);
    if (b.includes('authorization_code')) return b.includes('code_verifier=') && b.includes('code=BUENO') ? j({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600 }) : j({ error: 'invalid_grant' }, 400);
    return j({ access_token: 'AT2', expires_in: 3600 });
  }
  if (url.endsWith('/v1/me')) return j({ display_name: 'Angélica S' });
  if (url.includes('currently-playing')) return playing ? j(playing) : new Response(null, { status: 204 });
  if (url.includes('recently-played')) return j({ items: [{ played_at: '2026-10-07T10:00:00Z', track: { id: 'T0', name: 'Vieja', artists: [{ name: 'X' }], album: { images: [] }, external_urls: { spotify: 'https://open.spotify.com/track/T0aaaaaaaaaaaa' } } }] });
  if (url.includes('open.spotify.com/oembed')) return j({ title: 'Mi canción', thumbnail_url: 'https://i.scdn.co/t' });
  if (url.includes('youtube.com/oembed')) return j({ title: 'Un video', author_name: 'Canal', thumbnail_url: 'https://i.ytimg.com/x.jpg' });
  return j({}, 404);
};

let A, B;
test('enlaces: Spotify, YouTube y YouTube Music (y lo que no es música)', () => {
  assert.equal(parseMusicLink('https://open.spotify.com/intl-es/track/4uLU6hMCjMI75M1A2tKUQC?si=x').embed, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator');
  assert.equal(parseMusicLink('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M').kind, 'playlist');
  assert.equal(parseMusicLink('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM').url, 'https://music.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(parseMusicLink('https://youtu.be/dQw4w9WgXcQ?t=3').embed, 'https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0');
  assert.equal(parseMusicLink('https://www.youtube.com/playlist?list=PLabcdefghij123').kind, 'playlist');
  for (const bad of ['', 'hola', 'http://youtu.be/dQw4w9WgXcQ', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://open.spotify.com.evil.com/track/4uLU6hMCjMI75M1A2tKUQC', 'javascript:alert(1)']) assert.equal(parseMusicLink(bad), null, bad);
});

test('preparar: pareja', async () => {
  A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data;
  B = (await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: A.inviteCode, pact: 'acepto mi amor te amo mucho' } })).data;
  assert.ok(A.token && B.token);
});

test('vincular Spotify: inicio con PKCE, regreso sin sesión, un solo uso', async () => {
  assert.equal((await call('POST', '/spotify/start', { token: B.token, body: { redirectUri: 'http://malo.com/' } })).status, 400);
  const st = await call('POST', '/spotify/start', { token: B.token, body: { redirectUri: 'https://lindwyrm.netlify.app/' } });
  assert.equal(st.status, 200);
  const u = new URL(st.data.url);
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(u.searchParams.get('client_id'), 'cid123');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.match(u.searchParams.get('scope'), /currently-playing/);
  const state = u.searchParams.get('state');
  assert.equal((await call('POST', '/spotify/callback', { body: { code: 'BUENO', state: 'inventado' } })).status, 400);
  assert.equal((await call('POST', '/spotify/callback', { body: { code: 'MALO', state } })).status, 400); // Spotify lo rechaza
  const st2 = new URL((await call('POST', '/spotify/start', { token: B.token, body: { redirectUri: 'https://lindwyrm.netlify.app/' } })).data.url).searchParams.get('state');
  const ok = await call('POST', '/spotify/callback', { body: { code: 'BUENO', state: st2 } }); // sin Authorization
  assert.deepEqual([ok.status, ok.data.name], [200, 'Angélica S']);
  assert.equal((await call('POST', '/spotify/callback', { body: { code: 'BUENO', state: st2 } })).status, 400); // ya se usó
  const me = (await call('GET', '/music/me', { token: B.token })).data;
  assert.deepEqual([me.spotify.linked, me.spotify.name, me.spotify.available], [true, 'Angélica S', true]);
  assert.equal(JSON.stringify(me).includes('RT1'), false); // los tokens nunca salen del servidor
});

test('la pareja ve qué escucha (ahora y lo último) y solo su pareja', async () => {
  const p = (await call('GET', '/music/partner', { token: A.token })).data.partner;
  assert.deepEqual([p.name, p.now.title, p.now.artist, p.now.live], ['Angélica', 'Canción uno', 'Ella', true]);
  playing = null; // pausó
  await new Promise((r) => setTimeout(r, 0));
  // el resultado está en caché 15 s; se limpia desconectando y volviendo a conectar no hace falta: se prueba con otro usuario sin caché
  const h = (await call('GET', '/music/me', { token: B.token })).data;
  assert.equal(h.items[0].title, 'Vieja');
  const mine = (await call('GET', '/music/partner', { token: B.token })).data.partner; // lo que escucha Ángel: nada
  assert.deepEqual([mine.name, mine.now, mine.last], ['Ángel', null, null]);
});

test('reproducir un enlace dentro de la app: se guarda, cuenta como escuchando y se puede dejar', async () => {
  assert.equal((await call('POST', '/music/play', { token: A.token, body: { url: 'https://evil.com/x' } })).status, 400);
  const r = await call('POST', '/music/play', { token: A.token, body: { url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ' } });
  assert.deepEqual([r.data.item.title, r.data.item.artist, r.data.item.service], ['Un video', 'Canal', 'youtube']);
  const seen = (await call('GET', '/music/partner', { token: B.token })).data.partner;
  assert.deepEqual([seen.now.title, seen.now.live], ['Un video', true]);
  const hist = (await call('GET', '/music/me', { token: A.token })).data;
  assert.equal(hist.items[0].url, 'https://music.youtube.com/watch?v=dQw4w9WgXcQ');
  await call('POST', '/music/stop', { token: A.token });
  const after = (await call('GET', '/music/partner', { token: B.token })).data.partner;
  assert.equal(after.now, null);
  assert.equal(after.last.title, 'Un video'); // queda como “lo último”
});

test('desvincular Spotify', async () => {
  assert.equal((await call('POST', '/spotify/unlink', { token: B.token })).status, 200);
  assert.equal((await call('GET', '/music/me', { token: B.token })).data.spotify.linked, false);
});
