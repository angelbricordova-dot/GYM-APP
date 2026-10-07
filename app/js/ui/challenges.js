import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { processImage, fixWebmDuration } from '../photos.js';
import { Icon, Points, Sheet, Stepper, Field, Empty, Segmented, SaveButton, toast, cx, fmtDay } from './kit.js';

const IDEAS = ['10 flexiones', '20 sentadillas', 'Plancha 1 minuto', '30 abdominales', '15 min de caminata', '10 min de estiramiento'];
const MAX_MB = 5;

const nameOf = (id) => (id === S.state.auth.uid ? 'Tú' : S.state.partner?.name || 'Tu pareja');
const STATUS = { open: 'Pendiente', started: 'En curso', submitted: 'En revisión', approved: 'Cumplido', rejected: 'Por repetir', cancelled: 'Cancelado' };

// ============ tarjeta de reto ============
/** Una tarjeta de reto con la acción que toca según quién la mira y en qué estado está. */
export function ChallengeCard({ c, compact }) {
  const me = S.state.auth.uid;
  const mine = c.to === me; // me lo pusieron a mí
  const [sheet, setSheet] = useState(null); // 'record' | 'review' | 'new'
  const late = c.date < L.ymd() && ['open', 'started', 'rejected'].includes(c.status);

  const start = async () => {
    const r = c.status === 'started' ? { ok: true } : await S.startChallenge(c.id);
    if (!r.ok) return toast(r.data.error, { icon: '⚠️' });
    setSheet('record');
  };
  const cancel = async () => {
    if (!confirm('¿Cancelar este reto?')) return;
    const r = await S.cancelChallenge(c.id);
    if (!r.ok) toast(r.data.error, { icon: '⚠️' });
  };

  let action = null;
  if (mine) {
    if (c.status === 'open') action = html`<button class="btn primary block" onClick=${start}><${Icon} name="play" size=${16} fill /> Iniciar reto</button>`;
    else if (c.status === 'started') action = html`<button class="btn primary block" onClick=${() => setSheet('record')}><${Icon} name=${c.proof === 'photo' ? 'camera' : 'video'} size=${18} /> ${c.proof === 'photo' ? 'Enviar foto' : c.proof === 'video' ? 'Enviar video' : 'Enviar evidencia'}</button>`;
    else if (c.status === 'rejected') action = html`<button class="btn primary block" onClick=${start}>Intentarlo de nuevo</button>`;
  } else if (c.status === 'submitted') action = html`<button class="btn primary block" onClick=${() => setSheet('review')}><${Icon} name="check" size=${18} sw=${2.6} /> Revisar evidencia</button>`;
  else if (['open', 'started', 'rejected'].includes(c.status)) action = html`<button class="btn tinted block" onClick=${cancel}>Cancelar reto</button>`;

  const sub = mine
    ? { open: `${nameOf(c.from)} te reta`, started: 'Reto en curso', submitted: `Esperando que ${nameOf(c.from)} lo revise`, approved: `Cumplido · ganaste ${c.points}`, rejected: c.note ? `Para repetir: “${c.note}”` : 'Para repetir', cancelled: 'Cancelado' }[c.status]
    : { open: `Esperando a ${nameOf(c.to)}`, started: `${nameOf(c.to)} lo está haciendo`, submitted: `${nameOf(c.to)} envió su evidencia`, approved: `Aprobado · ${nameOf(c.to)} ganó ${c.points}`, rejected: 'Le pediste repetirlo', cancelled: 'Cancelado' }[c.status];

  return html`<article class=${cx('challenge', c.status, compact && 'compact', c.status === 'submitted' && !mine && 'attn')}>
    <div class="ch-top">
      <span class="ch-ic"><${Icon} name="target" size=${22} /></span>
      <div class="grow">
        <b>${c.title}</b>
        <small class=${cx('muted', c.status === 'rejected' && 'warn')}>${sub}${late ? ` · de ${fmtDay(c.date)}` : ''}${c.proof === 'photo' ? ' · 📷 con foto' : c.proof === 'video' ? ' · 🎥 con video' : ''}</small>
      </div>
      <${Points} n=${c.points} class=${cx(c.status === 'approved' && 'won')} />
    </div>
    ${action}
    ${c.evidence && !c.evidence.removed && !(c.status === 'submitted' && !mine) && ['submitted', 'approved'].includes(c.status) && html`<button class="btn tinted sm ch-view" onClick=${() => setSheet('view')}><${Icon} name="eye" size=${16} /> Ver evidencia</button>`}
    ${sheet === 'view' && html`<${ReviewSheet} c=${c} viewOnly onClose=${() => setSheet(null)} />`}
    ${sheet === 'record' && html`<${EvidenceSheet} c=${c} onClose=${() => setSheet(null)} />`}
    ${sheet === 'review' && html`<${ReviewSheet} c=${c} onClose=${() => setSheet(null)} />`}
  </article>`;
}

// ============ grabar o elegir evidencia ============
// Dos formas de demostrarlo: video (con audio) o foto. Antes de enviar se puede ver y repetir.
// Safari graba MP4 (con audio AAC). Chrome/Android: WebM con audio Opus (su MP4 sale sin duración y no se puede ver bien antes de enviar).
const SAFARI = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
const REC_TYPES = SAFARI
  ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
  : ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];

/** Los videos grabados con MediaRecorder (WebM) llegan sin duración: este truco hace que el reproductor la calcule y se pueda ver y adelantar. */
function fixDuration(v) {
  if (!v || v.duration !== Infinity) return;
  const play = v.autoplay || !v.paused;
  v.pause();
  v.addEventListener('seeked', () => { v.currentTime = 0; if (play) v.play().catch(() => {}); }, { once: true });
  v.currentTime = 1e7;
}

function EvidenceSheet({ c, onClose }) {
  const live = useRef();
  const preview = useRef();
  const stream = useRef(null);
  const rec = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const file = useRef();
  const proof = c.proof || 'any'; // lo que pidió quien puso el reto: photo | video | any
  const [mode, setMode] = useState(proof === 'photo' ? 'photo' : 'video'); // video | photo
  const [facing, setFacing] = useState('user');
  const [phase, setPhase] = useState('idle'); // idle | count | rec | done
  const [count, setCount] = useState(3);
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [audio, setAudio] = useState(true); // ¿la cámara abierta trae micrófono?
  const [hadAudio, setHadAudio] = useState(false); // ¿el video grabado lleva audio?
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const canCamera = !!navigator.mediaDevices?.getUserMedia;

  const liveStream = useRef(null); // lo que se ve en pantalla: solo la imagen, sin audio (así la vista previa no se queda negra ni da eco)
  const [, setCamReady] = useState(0);
  const stopCamera = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; liveStream.current = null; if (live.current) live.current.srcObject = null; };
  /** Conecta la cámara al <video>: atributos antes que el flujo, y se reintenta si Safari lo deja en negro. */
  const attachLive = () => {
    const el = live.current, s = liveStream.current;
    if (!el || !s || el.srcObject === s) return;
    el.muted = true; el.setAttribute('muted', ''); el.playsInline = true; el.setAttribute('playsinline', '');
    el.srcObject = s;
    const go = () => el.play().catch(() => {});
    el.onloadedmetadata = go;
    go();
    setTimeout(() => { if (live.current === el && el.srcObject === s && !el.videoWidth) { el.srcObject = null; el.srcObject = s; go(); } }, 1200);
  };
  useEffect(() => { attachLive(); }); // tras cada render: si el <video> existe y aún no tiene la cámara, se conecta
  useEffect(() => () => { stopCamera(); clearInterval(timer.current); }, []);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  // Cámara en vivo. En modo video pide también el micrófono; si no lo dan, sigue solo con video y lo avisa.
  useEffect(() => {
    if (!canCamera || blob) return;
    let off = false;
    stopCamera();
    const video = { facingMode: facing, width: { ideal: mode === 'photo' ? 1280 : 640 }, height: { ideal: mode === 'photo' ? 960 : 480 } };
    const open = async () => {
      let s;
      if (mode === 'video' && canRecord) {
        try { s = await navigator.mediaDevices.getUserMedia({ video, audio: { echoCancellation: true, noiseSuppression: true } }); setAudio(true); }
        catch { s = await navigator.mediaDevices.getUserMedia({ video, audio: false }); setAudio(false); }
      } else s = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      if (off) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      liveStream.current = new MediaStream(s.getVideoTracks());
      attachLive();
      setCamReady((n) => n + 1);
    };
    open().catch(() => setErr('No pude abrir la cámara. Revisa el permiso del navegador o elige un archivo del carrete.'));
    return () => { off = true; };
  }, [facing, blob, canCamera, mode]);

  const finish = (b, withAudio = false) => {
    clearInterval(timer.current); stopCamera(); setHadAudio(withAudio);
    setBlob(b); setUrl(URL.createObjectURL(b)); setPhase('done');
  };

  const startRec = () => {
    if (!stream.current) return;
    setErr(''); setPhase('count'); setCount(3);
    let n = 3;
    timer.current = setInterval(() => {
      n -= 1;
      if (n > 0) return setCount(n);
      clearInterval(timer.current);
      const mimeType = REC_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      chunks.current = [];
      const withAudio = stream.current.getAudioTracks().length > 0;
      const r = new MediaRecorder(stream.current, { ...(mimeType && { mimeType }), videoBitsPerSecond: 900_000, audioBitsPerSecond: 48_000 });
      rec.current = r;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      const t0 = Date.now();
      r.onstop = async () => finish(await fixWebmDuration(new Blob(chunks.current, { type: (r.mimeType || mimeType || 'video/webm').split(';')[0] }), Date.now() - t0), withAudio);
      r.start(250);
      setPhase('rec'); setSecs(0);
      timer.current = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setSecs(s); if (s >= 20) stopRec(); }, 250);
    }, 1000);
  };
  const stopRec = () => { clearInterval(timer.current); if (rec.current?.state === 'recording') rec.current.stop(); };

  /** Tomar la foto con la cámara en vivo (sin espejo: sale como se ve para los demás). */
  const snap = () => {
    const v = live.current;
    if (!v?.videoWidth) return;
    const k = Math.min(1, 1080 / Math.max(v.videoWidth, v.videoHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
    cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
    cv.toBlob((b) => b && finish(b), 'image/jpeg', 0.85);
  };

  const pick = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    try {
      if (f.type.startsWith('image/') && proof === 'video') setErr('Este reto se demuestra con un video.');
      else if (!f.type.startsWith('image/') && proof === 'photo') setErr('Este reto se demuestra con una foto.');
      else if (f.type.startsWith('image/')) finish(await processImage(f, { max: 1080, quality: 0.8 }));
      else if (f.size > MAX_MB * 1e6) setErr(`Ese video pesa ${(f.size / 1e6).toFixed(1)} MB (máximo ${MAX_MB}). Grábalo aquí en la app, que lo comprime.`);
      else finish(f, true);
    } catch { setErr('No pude leer ese archivo.'); }
  };

  const retry = () => { setBlob(null); setUrl(null); setPhase('idle'); setErr(''); };
  const send = async () => {
    setBusy(true); setErr('');
    const r = await S.submitEvidence(c.id, blob);
    setBusy(false);
    if (r.ok) { toast('Evidencia enviada. Ahora la revisa tu pareja', { icon: '📨' }); onClose(); } else setErr(r.data.error || 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.');
  };

  const isVideo = blob?.type.startsWith('video');
  const noCam = !canCamera || err.startsWith('No pude abrir');
  return html`<${Sheet} title="Tu evidencia" full onClose=${onClose}>
    <p class="muted"><b>${c.title}</b> · ${c.points} puntos de amor. ${{ photo: 'Demuéstralo con una foto.', video: 'Demuéstralo con un video (hasta 20 s).', any: 'Demuéstralo con un video o con una foto.' }[proof]}</p>
    ${phase === 'idle' && proof === 'any' && html`<${Segmented} value=${mode} onChange=${(m) => { setMode(m); setErr(''); }} options=${[{ id: 'video', label: '🎥 Video' }, { id: 'photo', label: '📷 Foto' }]} />`}
    <div class=${cx('cam', phase)}>
      ${phase === 'done'
        ? (isVideo
          ? html`<video key="preview" ref=${preview} src=${url} controls playsinline autoplay loop onLoadedMetadata=${(e) => fixDuration(e.target)}></video>`
          : html`<img src=${url} alt="Tu evidencia" />`)
        : !noCam && (mode === 'photo' || canRecord) ? html`<video key="live" ref=${live} playsinline muted autoplay class=${facing === 'user' ? 'mirror' : ''}></video>` : html`<div class="cam-off"><${Icon} name="camera" size=${34} /><span>Cámara no disponible</span></div>`}
      ${phase === 'count' && html`<div class="countdown" key=${count}>${count}</div>`}
      ${phase === 'rec' && html`<div class="rec-badge"><i></i>${secs}s</div>`}
      ${phase === 'done' && isVideo && html`<span class=${cx('audio-chip', hadAudio ? 'on' : 'off')}><${Icon} name="mic" size=${14} /> ${hadAudio ? 'Con audio' : 'Sin audio'}</span>`}
    </div>
    ${mode === 'video' && phase !== 'done' && !audio && !noCam && html`<p class="notice">No tengo permiso del micrófono: el video saldría <b>sin audio</b>. Permite el micrófono para este sitio (iPhone: Ajustes → Safari → Micrófono) y vuelve a abrir esta pantalla.</p>`}
    ${err && html`<p class="notice" role="alert">${err}</p>`}
    ${phase === 'done'
      ? html`<p class="muted small center">${isVideo ? 'Míralo antes de enviarlo.' : 'Así se va a ver.'}</p>
          <button class="btn primary block lg" disabled=${busy} onClick=${send}>${busy ? 'Enviando…' : 'Enviar evidencia'}</button>
          <button class="btn tinted block" onClick=${retry} disabled=${busy}>Repetir</button>`
      : html`<div class="rec-row">
          ${!noCam && phase === 'idle' && html`<button class="icon-btn lg" onClick=${() => setFacing(facing === 'user' ? 'environment' : 'user')} aria-label="Girar cámara"><${Icon} name="repeat" size=${20} /></button>`}
          ${!noCam && mode === 'video' && canRecord && html`<button class=${cx('rec-btn', phase === 'rec' && 'on')} onClick=${phase === 'rec' ? stopRec : startRec} disabled=${phase === 'count'} aria-label=${phase === 'rec' ? 'Detener grabación' : 'Grabar'}><i></i></button>`}
          ${!noCam && mode === 'photo' && html`<button class="rec-btn shutter" onClick=${snap} aria-label="Tomar foto"><i></i></button>`}
          <button class="icon-btn lg" onClick=${() => file.current.click()} aria-label="Elegir del carrete"><${Icon} name="image" size=${20} /></button>
        </div>
        <p class="muted small center">${phase === 'rec' ? 'Grabando… toca el botón para detener (máx. 20 s)' : mode === 'photo' ? 'Toca el círculo para tomar la foto. A la derecha, elige una del carrete.' : 'Toca el círculo para grabar (cuenta de 3). A la derecha, elige un video o foto del carrete.'}</p>`}
    <input ref=${file} type="file" accept=${proof === 'photo' || mode === 'photo' ? 'image/*' : proof === 'video' ? 'video/*' : 'image/*,video/*'} hidden onChange=${pick} />
  <//>`;
}

// ============ revisar y aprobar / ver evidencia ============
export function ReviewSheet({ c, onClose, viewOnly }) {
  const [src, setSrc] = useState(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; S.loadEvidence(c).then((u) => live && setSrc(u)); return () => { live = false; }; }, [c.id, c.evidence?.ts]);

  const decide = async (action) => {
    setBusy(true);
    const r = await S.reviewChallenge(c.id, action, note);
    setBusy(false);
    if (!r.ok) return toast(r.data.error, { icon: '⚠️' });
    toast(action === 'approve' ? `¡Aprobado! ${nameOf(c.to)} ganó ${c.points} puntos de amor` : 'Le pediste repetirlo', { icon: action === 'approve' ? '💗' : '↩️' });
    onClose();
  };

  const media = html`<div class="cam done">
      ${!src ? html`<div class="spinner"></div>` : c.evidence?.kind === 'video' ? html`<video src=${src} controls playsinline onLoadedMetadata=${(e) => fixDuration(e.target)}></video>` : html`<img src=${src} alt="Evidencia" />`}
    </div>
    <${SaveButton} url=${src} name=${`lindwyrm-reto-${c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'evidencia'}`} />`;

  if (viewOnly) return html`<${Sheet} title=${c.title} onClose=${onClose}>
    <p class="muted">Evidencia de ${nameOf(c.to)} · <${Points} n=${c.points} size=${13} /></p>
    ${media}
  <//>`;

  return html`<${Sheet} title=${c.title} onClose=${onClose}>
    <p class="muted">${nameOf(c.to)} envió su evidencia. Si de verdad lo hizo, apruébalo y recibirá <b>${c.points} puntos de amor</b>.</p>
    ${media}
    ${asking
      ? html`<${Field} label="¿Qué debería mejorar? (opcional)"><input value=${note} onInput=${(e) => setNote(e.target.value)} maxlength="140" placeholder="Ej. No se alcanza a ver completo" /><//>
         <button class="btn primary block" disabled=${busy} onClick=${() => decide('reject')}>Pedir que lo repita</button>
         <button class="btn tinted block" onClick=${() => setAsking(false)}>Volver</button>`
      : html`<button class="btn primary block lg" disabled=${busy || !src} onClick=${() => decide('approve')}>Aprobar y dar ${c.points} puntos</button>
         <button class="btn tinted block" disabled=${busy} onClick=${() => setAsking(true)}>Pedir que lo repita</button>`}
  <//>`;
}

// ============ crear un reto ============
export function NewChallengeSheet({ onClose }) {
  const partner = S.state.partner;
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState('20');
  const [proof, setProof] = useState('any');
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await S.createChallenge({ title, points: L.num(points), proof, date: L.ymd() });
    setBusy(false);
    if (r.ok) { toast(`Reto enviado a ${partner?.name}`, { icon: '🎯' }); onClose(); } else toast(r.data.error, { icon: '⚠️' });
  };
  return html`<${Sheet} title=${`Retar a ${partner?.name || 'tu pareja'}`} onClose=${onClose}>
    <div class="idea-chips">${IDEAS.map((i) => html`<button class=${cx('chip pick', title === i && 'on')} onClick=${() => setTitle(i)}>${i}</button>`)}</div>
    <form class="stack" onSubmit=${send}>
      <${Field} label="El reto de hoy"><input value=${title} onInput=${(e) => setTitle(e.target.value)} maxlength="80" required placeholder="Ej. 10 flexiones" /><//>
      <${Field} label="Puntos de amor que gana al cumplirlo"><${Stepper} value=${points} onChange=${setPoints} step=${5} min=${1} label="Puntos" /><//>
      <div class="field"><span>¿Cómo lo demuestra?</span><${Segmented} value=${proof} onChange=${setProof} options=${[{ id: 'photo', label: '📷 Foto' }, { id: 'video', label: '🎥 Video' }, { id: 'any', label: 'Cualquiera' }]} /></div>
      <p class="muted small">${{ photo: 'Tendrá que mandar una foto.', video: 'Tendrá que grabarse en video.', any: 'Podrá mandar una foto o un video.' }[proof]} Tú decides si lo aprueban.</p>
      <button class="btn primary block lg" disabled=${busy || !title.trim()}>${busy ? 'Enviando…' : 'Enviar reto'}</button>
    </form>
  <//>`;
}

// ============ panel de retos (pestaña Juntos) ============
export function ChallengesPanel() {
  const [creating, setCreating] = useState(false);
  const me = S.state.auth.uid;
  const all = [...S.state.challenges].sort((a, b) => b.ts - a.ts);
  const active = (c) => ['open', 'started', 'submitted', 'rejected'].includes(c.status);
  const forMe = all.filter((c) => c.to === me && active(c));
  const sent = all.filter((c) => c.from === me && active(c));
  const done = all.filter((c) => !active(c)).slice(0, 12);

  return html`<div class="stack-lg">
    ${S.state.partner
      ? html`<button class="btn primary block lg" onClick=${() => setCreating(true)}><${Icon} name="target" size=${20} /> Poner un reto a ${S.state.partner.name}</button>`
      : html`<p class="notice">Cuando tu pareja se una podrán retarse durante el día.</p>`}
    ${forMe.length > 0 && html`<section><h3 class="sec-h">Para ti</h3>${forMe.map((c) => html`<${ChallengeCard} key=${c.id} c=${c} />`)}</section>`}
    ${sent.length > 0 && html`<section><h3 class="sec-h">Los que pusiste</h3>${sent.map((c) => html`<${ChallengeCard} key=${c.id} c=${c} />`)}</section>`}
    ${forMe.length + sent.length === 0 && html`<${Empty} icon="🎯" title="Sin retos por ahora" text="Pónganse retos del día: 10 flexiones, plancha, una caminata… Quien lo cumple y lo demuestra gana puntos de amor." />`}
    ${done.length > 0 && html`<section><h3 class="sec-h">Historial</h3>${done.map((c) => html`<${ChallengeCard} key=${c.id} c=${c} compact />`)}</section>`}
    ${creating && html`<${NewChallengeSheet} onClose=${() => setCreating(false)} />`}
  </div>`;
}
