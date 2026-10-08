// Música: reproducir YouTube / YouTube Music dentro de la app. YouTube no tiene una API oficial para leer el historial,
// así que se guarda lo que se reproduce aquí (historial propio) y la pareja ve “está escuchando…” mientras suena.
import { parseMusicLink } from '../app/js/music-links.js';

/** Punto de salida a internet intercambiable (las pruebas lo reemplazan para no llamar a YouTube). */
export const _net = { fetch: (url, opts) => fetch(url, opts) };

const LIVE_MS = 5 * 60_000; // algo reproducido dentro de la app cuenta como “escuchando” unos minutos
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export function createMusic(db) {
  const timed = async (url, opts = {}, ms = 3500) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await _net.fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
  };

  /** Qué escucha esa persona ahora y lo último que escuchó. */
  function listening(rec) {
    const now = rec.listening && Date.now() - rec.listening.ts < LIVE_MS ? { ...rec.listening, live: true } : null;
    return { now, last: now ? null : rec.musicLog?.[0] || null };
  }

  /** Un enlace que se reproduce dentro de la app: se guarda en el historial y cuenta como “escuchando”. */
  async function play(user, { url }) {
    const link = parseMusicLink(url);
    if (!link) return { status: 400, error: 'Pega un enlace de YouTube o YouTube Music.' };
    let title = link.kind === 'video' ? 'Video de YouTube' : 'Lista de YouTube';
    let artist = '';
    let art = null;
    try {
      const d = await (await timed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.url)}`)).json();
      title = clip(d.title, 120) || title; artist = clip(d.author_name || '', 120); art = typeof d.thumbnail_url === 'string' && d.thumbnail_url.startsWith('https://') ? d.thumbnail_url : null;
    } catch { /* sin título: se guarda igual */ }
    const item = { service: 'youtube', title, artist, art, url: link.url, ts: Date.now() };
    const u = await db.get(`user/${user.id}`);
    u.listening = item;
    u.musicLog = [item, ...(u.musicLog || []).filter((x) => x.url !== item.url)].slice(0, 40);
    await db.set(`user/${user.id}`, u);
    return { item };
  }

  /** “Detener”: deja de contar como escuchando (lo último que sonó se queda en el historial). */
  async function stop(user) {
    const u = await db.get(`user/${user.id}`);
    delete u.listening;
    await db.set(`user/${user.id}`, u);
    return { ok: true };
  }

  const mine = (rec) => ({ now: listening(rec).now, items: (rec.musicLog || []).filter((i) => i.service === 'youtube') });

  return { listening, play, stop, mine };
}
