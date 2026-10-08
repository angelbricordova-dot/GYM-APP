import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import { Icon, toast, cx, relTime } from './kit.js';
import { closeScreen, openScreen } from './nav.js';
import { parseMusicLink } from '../music-links.js';

// ---------- reproductor global: sigue sonando mientras cambias de pestaña o entrenas ----------
const player = { item: null };
const listeners = new Set();
const usePlayer = () => {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((v) => v + 1); listeners.add(f); return () => listeners.delete(f); }, []);
  return player.item;
};
const emit = () => listeners.forEach((f) => f());

/** Reproduce un enlace o un elemento del historial dentro de la app y avisa a la pareja qué escuchas. */
export async function playItem(item) {
  const link = parseMusicLink(item?.url);
  if (!link) { toast('Ese enlace no se puede reproducir aquí', { icon: '⚠️' }); return null; }
  player.item = { ...item, link };
  emit();
  const r = await S.request('POST', '/music/play', { url: link.url });
  if (r.ok) player.item = { ...r.data.item, link };
  else if (r.status !== 0) toast(r.data.error, { icon: '⚠️' });
  emit();
  return player.item;
}
export function stopPlayer() {
  player.item = null;
  emit();
  S.request('POST', '/music/stop');
}

/** Se monta una vez en la app: el iframe no se destruye al navegar, así la música no se corta. */
export function MusicDock({ expanded }) {
  const item = usePlayer();
  if (!item) return null;
  const l = item.link;
  const full = expanded;
  const h = full ? 220 : 72;
  return html`<div class=${cx('music-dock', full ? 'full' : 'mini')} style=${`height:${h}px`}>
    <iframe title="Reproductor" src=${l.embed} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" loading="eager"></iframe>
    ${!full && html`<button class="dock-x" onClick=${stopPlayer} aria-label="Cerrar el reproductor"><${Icon} name="x" size=${14} sw=${2.6} /></button>`}
  </div>`;
}

// ---------- lo que escucha mi pareja ----------
/** Consulta qué escucha mi pareja cada 20 s mientras el componente está en pantalla. */
export function usePartnerMusic(on = true) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const load = async () => { const r = await S.request('GET', '/music/partner'); if (alive && r.ok) setInfo(r.data.partner); };
    load();
    const id = setInterval(load, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [on]);
  return info;
}

/** “🎧 Angélica está escuchando…” (o lo último que escuchó). Un toque lo reproduce aquí. */
export function ListeningLine({ info, compact }) {
  if (!info || (!info.now && !info.last)) return null;
  const t = info.now || info.last;
  const live = !!info.now;
  return html`<button class=${cx('listening', compact && 'compact', live && 'live')} onClick=${() => playItem(t)}>
    ${t.art ? html`<img src=${t.art} alt="" />` : html`<span class="l-art"><${Icon} name="music" size=${18} /></span>`}
    <span class="grow"><small class="muted">${live ? html`<i class="live-dot"></i> ${info.name} está escuchando` : `${info.name} escuchó ${relTime(t.ts)}`}</small><b>${t.title}</b>${t.artist && html`<small class="muted">${t.artist}</small>`}</span>
    <${Icon} name="play" size=${16} fill />
  </button>`;
}

// ---------- pantalla Música ----------
export function Music() {
  const item = usePlayer();
  const [data, setData] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const partner = usePartnerMusic(!!S.state.partner);
  const load = async () => { const r = await S.request('GET', '/music/me'); if (r.ok) setData(r.data); };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (item) { const id = setTimeout(load, 1500); return () => clearTimeout(id); } }, [item?.url]);

  const submit = async (e) => {
    e.preventDefault();
    if (!parseMusicLink(url)) return toast('Pega un enlace de YouTube Music', { icon: '⚠️' });
    setBusy(true);
    await playItem({ url });
    setBusy(false);
    setUrl('');
  };
  const paste = async () => { try { const t = await navigator.clipboard.readText(); if (t) setUrl(t.trim()); } catch { toast('Pega el enlace en el cuadro', { icon: 'ℹ️' }); } };
  const slot = item ? 220 : 0;

  return html`<div class="screen music">
    <div class="screen-top"><button class="icon-btn" onClick=${closeScreen} aria-label="Volver"><${Icon} name="left" size=${20} /></button><b>Música</b><span></span></div>
    ${item && html`<div class="music-slot" style=${`height:${slot + 12}px`}></div>`}
    <div class="screen-body">
      ${item && html`<div class="music-now"><span class="grow"><small class="muted">Reproduciendo</small><b>${item.title || 'Música'}</b></span><button class="btn sm tinted" onClick=${stopPlayer}>Detener</button></div>`}
      ${S.state.partner && html`<${ListeningLine} info=${partner} />`}

      <form class="music-add" onSubmit=${submit}>
        <input class="search" type="url" inputmode="url" placeholder="Pega un enlace de YouTube Music" value=${url} onInput=${(e) => setUrl(e.target.value)} />
        <div class="row-btns">
          <button type="button" class="btn tinted sm" onClick=${paste}><${Icon} name="copy" size=${15} /> Pegar</button>
          <button class="btn primary sm" disabled=${busy || !url.trim()}><${Icon} name="play" size=${15} fill /> Reproducir</button>
        </div>
      </form>

      <p class="muted small">YouTube Music no permite ver tu historial desde otras apps: aquí se guarda lo que reproduces. Abre una canción en YouTube Music, toca Compartir → Copiar enlace y pégalo aquí.</p>

      <h3 class="sec-h">Historial</h3>
      ${data && data.items.length === 0 && html`<p class="muted">Todavía no hay nada. Pega un enlace de YouTube Music para empezar.</p>`}
      <div class="group">${(data?.items || []).map((t) => html`<button class="row track" onClick=${() => playItem(t)}>
        ${t.art ? html`<img src=${t.art} alt="" />` : html`<span class="l-art"><${Icon} name="music" size=${18} /></span>`}
        <div class="grow"><b>${t.title}</b><small class="muted">${[t.artist, 'YouTube', relTime(t.ts)].filter(Boolean).join(' · ')}</small></div>
        <${Icon} name="play" size=${16} fill />
      </button>`)}</div>
    </div>
  </div>`;
}

export const openMusic = () => openScreen('music');
