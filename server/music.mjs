// Música: vincular Spotify (OAuth con PKCE: sin secreto en el servidor, solo el ID de cliente), saber qué escucha cada quien y guardar lo que se reproduce
// dentro de la app (también enlaces de YouTube / YouTube Music, que no tienen una API oficial para ver el historial).
import { randomBytes, createHash } from 'node:crypto';
import { parseMusicLink } from '../app/js/music-links.js';

/** Punto de salida a internet intercambiable (las pruebas lo reemplazan para no llamar a Spotify/YouTube). */
export const _net = { fetch: (url, opts) => fetch(url, opts) };

const SCOPES = 'user-read-currently-playing user-read-recently-played';
const LIVE_MS = 5 * 60_000; // algo reproducido dentro de la app cuenta como “escuchando” unos minutos
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export function createMusic(db) {
  const cache = new Map(); // `${uid}:${clave}` → { at, value }
  const cached = async (key, ttl, fn) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = await fn();
    cache.set(key, { at: Date.now(), value });
    return value;
  };
  const clientId = () => process.env.SPOTIFY_CLIENT_ID || null;
  const timed = async (url, opts = {}, ms = 4000) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await _net.fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
  };

  // ---------- vincular Spotify ----------
  /** Paso 1: el servidor guarda el verificador PKCE y devuelve la dirección de Spotify. Así el regreso funciona aunque abra en otro navegador. */
  async function start(user, { redirectUri }) {
    const id = clientId();
    if (!id) return { status: 409, error: 'Falta configurar SPOTIFY_CLIENT_ID en Netlify.' };
    if (!/^https:\/\/[^/]+\/$/.test(String(redirectUri || '')) && !/^http:\/\/localhost(:\d+)?\/$/.test(String(redirectUri || ''))) return { status: 400, error: 'Dirección de regreso inválida.' };
    const verifier = randomBytes(48).toString('base64url');
    const state = randomBytes(18).toString('base64url');
    await db.set(`spotify-pending/${state}`, { uid: user.id, verifier, redirectUri, ts: Date.now() });
    const q = new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPES, redirect_uri: redirectUri, state, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
    return { url: `https://accounts.spotify.com/authorize?${q}` };
  }

  /** Paso 2 (sin sesión): Spotify regresó con `code` y `state`. */
  async function callback({ code, state }) {
    const key = `spotify-pending/${clip(state, 60)}`;
    const p = await db.get(key);
    if (!p || Date.now() - p.ts > 15 * 60_000) return { status: 400, error: 'El enlace de Spotify caducó. Inténtalo otra vez.' };
    await db.del(key);
    const res = await timed('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: clip(code, 600), redirect_uri: p.redirectUri, client_id: clientId() || '', code_verifier: p.verifier }),
    }, 8000).catch(() => null);
    const data = res && (await res.json().catch(() => ({})));
    if (!res?.ok || !data.refresh_token) return { status: 400, error: 'Spotify no aceptó la vinculación.' };
    const user = await db.get(`user/${p.uid}`);
    if (!user) return { status: 404, error: 'No existe esa cuenta.' };
    user.spotify = { refresh: data.refresh_token, access: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
    try {
      const me = await (await timed('https://api.spotify.com/v1/me', { headers: { authorization: `Bearer ${data.access_token}` } })).json();
      user.spotify.name = clip(me.display_name || me.id, 40);
    } catch { /* el nombre es solo decorativo */ }
    await db.set(`user/${user.id}`, user);
    return { ok: true, name: user.spotify.name || '' };
  }

  async function unlink(user) {
    const u = await db.get(`user/${user.id}`);
    delete u.spotify;
    await db.set(`user/${user.id}`, u);
    for (const k of cache.keys()) if (k.startsWith(`${user.id}:`)) cache.delete(k);
    return { ok: true };
  }

  /** Token de acceso vigente (lo renueva solo). Si Spotify revoca el permiso, se desvincula. */
  async function token(rec) {
    const sp = rec.spotify;
    if (!sp) return null;
    if (sp.access && sp.exp > Date.now() + 60_000) return sp.access;
    const res = await timed('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: sp.refresh, client_id: clientId() || '' }),
    }, 6000).catch(() => null);
    if (!res) return null; // sin conexión: se intenta luego
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) { const u = await db.get(`user/${rec.id}`); delete u.spotify; await db.set(`user/${rec.id}`, u); rec.spotify = undefined; }
      return null;
    }
    const u = await db.get(`user/${rec.id}`);
    u.spotify = { ...u.spotify, access: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000, refresh: data.refresh_token || u.spotify.refresh };
    await db.set(`user/${rec.id}`, u);
    rec.spotify = u.spotify;
    return u.spotify.access;
  }

  const trackOf = (t, extra = {}) => t && ({
    service: 'spotify', title: clip(t.name, 120), artist: clip((t.artists || []).map((a) => a.name).join(', '), 120),
    art: t.album?.images?.at(-2)?.url || t.album?.images?.[0]?.url || null, url: t.external_urls?.spotify || (t.id ? `https://open.spotify.com/track/${t.id}` : null), ...extra,
  });

  const api = async (rec, path) => {
    const tk = await token(rec);
    if (!tk) return { error: rec.spotify ? 'Spotify no responde ahora.' : null };
    const res = await timed(`https://api.spotify.com/v1${path}`, { headers: { authorization: `Bearer ${tk}` } }).catch(() => null);
    if (!res) return { error: 'Spotify no responde ahora.' };
    if (res.status === 204) return { empty: true };
    if (res.status === 403) return { error: 'Spotify no deja ver tu actividad: agrega tu correo en el panel de desarrolladores de Spotify (modo desarrollo).' };
    if (!res.ok) return { error: `Spotify respondió ${res.status}.` };
    return { data: await res.json().catch(() => null) };
  };

  // ---------- lo que se escucha ----------
  const spotifyNow = (rec) => cached(`${rec.id}:now`, 15_000, async () => {
    if (!rec.spotify) return { value: null };
    const r = await api(rec, '/me/player/currently-playing');
    const d = r.data;
    if (d?.item && d.currently_playing_type === 'track' && d.is_playing) return { value: trackOf(d.item, { live: true }) };
    return { value: null, error: r.error };
  });
  const spotifyRecent = (rec, n) => cached(`${rec.id}:recent${n}`, 60_000, async () => {
    if (!rec.spotify) return { items: [] };
    const r = await api(rec, `/me/player/recently-played?limit=${n}`);
    return { items: (r.data?.items || []).map((i) => trackOf(i.track, { ts: Date.parse(i.played_at) || 0, source: 'spotify' })).filter((x) => x?.title), error: r.error };
  });

  /** Qué escucha esa persona ahora y lo último que escuchó. */
  async function listening(rec) {
    const [sn, sr] = await Promise.all([spotifyNow(rec), spotifyRecent(rec, 1)]);
    const mine = rec.listening && Date.now() - rec.listening.ts < LIVE_MS ? { ...rec.listening, live: true } : null;
    const now = sn.value || mine;
    const lastCand = [sr.items[0], rec.musicLog?.[0]].filter(Boolean).sort((a, b) => b.ts - a.ts)[0] || null;
    return { now, last: now ? null : lastCand, error: sn.error || sr.error || null };
  }

  async function history(rec) {
    const sr = await spotifyRecent(rec, 30);
    const items = [...sr.items, ...(rec.musicLog || [])].sort((a, b) => b.ts - a.ts);
    const seen = new Set();
    const uniq = items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
    return { items: uniq.slice(0, 40), error: sr.error || null };
  }

  /** Un enlace que se reproduce dentro de la app: se guarda en el historial y cuenta como “escuchando”. */
  async function play(user, { url }) {
    const link = parseMusicLink(url);
    if (!link) return { status: 400, error: 'Pega un enlace de Spotify, YouTube o YouTube Music.' };
    let title = link.kind === 'video' ? 'Video de YouTube' : link.service === 'spotify' ? 'Spotify' : 'Lista de YouTube';
    let artist = '';
    let art = null;
    try {
      const oe = link.service === 'spotify' ? `https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}` : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.url)}`;
      const d = await (await timed(oe, {}, 3500)).json();
      title = clip(d.title, 120) || title; artist = clip(d.author_name || '', 120); art = typeof d.thumbnail_url === 'string' && d.thumbnail_url.startsWith('https://') ? d.thumbnail_url : null;
    } catch { /* sin título: se guarda igual */ }
    const item = { service: link.service, title, artist, art, url: link.url, ts: Date.now(), source: 'app' };
    const u = await db.get(`user/${user.id}`);
    u.listening = item;
    u.musicLog = [item, ...(u.musicLog || []).filter((x) => x.url !== item.url)].slice(0, 40);
    await db.set(`user/${user.id}`, u);
    for (const k of cache.keys()) if (k.startsWith(`${user.id}:`)) cache.delete(k);
    return { item };
  }

  /** “Ya terminé”: deja de contar como escuchando. */
  async function stop(user) {
    const u = await db.get(`user/${user.id}`);
    delete u.listening;
    await db.set(`user/${user.id}`, u);
    for (const k of cache.keys()) if (k.startsWith(`${user.id}:`)) cache.delete(k);
    return { ok: true };
  }

  async function mine(rec) {
    const [l, h] = await Promise.all([listening(rec), history(rec)]);
    return { spotify: { available: !!clientId(), linked: !!rec.spotify, name: rec.spotify?.name || '' }, now: l.now, items: h.items, error: l.error || h.error };
  }

  return { clientId, start, callback, unlink, play, stop, listening, mine };
}
