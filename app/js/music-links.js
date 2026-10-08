// Enlaces de YouTube y YouTube Music → lo necesario para reproducirlos dentro de la app. Sin dependencias: lo usan el servidor y la app.

/** @returns {{service:'youtube', kind:'video'|'playlist', id:string, url:string, embed:string}|null} */
export function parseMusicLink(raw) {
  const text = String(raw || '').trim().slice(0, 300);
  let u;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let video = null;
  if (host === 'youtu.be') video = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com') video = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/) || [])[1] || null;
  else return null;
  const list = u.searchParams.get('list');
  const base = u.hostname.startsWith('music.') ? 'https://music.youtube.com' : 'https://www.youtube.com';
  if (video && /^[\w-]{11}$/.test(video)) {
    return { service: 'youtube', kind: 'video', id: video, url: `${base}/watch?v=${video}`, embed: `https://www.youtube.com/embed/${video}?playsinline=1&rel=0` };
  }
  if (list && /^[\w-]{10,60}$/.test(list)) {
    return { service: 'youtube', kind: 'playlist', id: list, url: `${base}/playlist?list=${list}`, embed: `https://www.youtube.com/embed/videoseries?list=${list}&playsinline=1` };
  }
  return null;
}
