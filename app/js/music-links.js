// Enlaces de música (Spotify, YouTube y YouTube Music) → lo necesario para reproducirlos dentro de la app. Sin dependencias: lo usan el servidor y la app.

const SPOTIFY = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,30})/;
const SPOTIFY_URI = /^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,30})$/;

/** @returns {{service:'spotify'|'youtube', kind:string, id:string, url:string, embed:string}|null} */
export function parseMusicLink(raw) {
  const text = String(raw || '').trim().slice(0, 300);
  let m = text.match(SPOTIFY) || text.match(SPOTIFY_URI);
  if (m) {
    return { service: 'spotify', kind: m[1], id: m[2], url: `https://open.spotify.com/${m[1]}/${m[2]}`, embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator` };
  }
  let u;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let video = null;
  if (host === 'youtu.be') video = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com') video = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/) || [])[1] || null;
  else return null;
  const list = u.searchParams.get('list');
  const ytMusic = u.hostname.startsWith('music.');
  const base = ytMusic ? 'https://music.youtube.com' : 'https://www.youtube.com';
  if (video && /^[\w-]{11}$/.test(video)) {
    return { service: 'youtube', kind: 'video', id: video, url: `${base}/watch?v=${video}`, embed: `https://www.youtube.com/embed/${video}?playsinline=1&rel=0` };
  }
  if (list && /^[\w-]{10,60}$/.test(list)) {
    return { service: 'youtube', kind: 'playlist', id: list, url: `${base}/playlist?list=${list}`, embed: `https://www.youtube.com/embed/videoseries?list=${list}&playsinline=1` };
  }
  return null;
}

/** Misma cosa pero desde un elemento guardado (por ejemplo del historial): la dirección para reproducirlo en la app. */
export const embedOf = (item) => (item?.url ? parseMusicLink(item.url)?.embed || null : null);
