import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { processImage } from '../photos.js';
import { Icon, Points, Sheet, Stepper, Field, Empty, toast, cx, fmtDay } from './kit.js';

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
    else if (c.status === 'started') action = html`<button class="btn primary block" onClick=${() => setSheet('record')}><${Icon} name="video" size=${18} /> Enviar evidencia</button>`;
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
        <small class=${cx('muted', c.status === 'rejected' && 'warn')}>${sub}${late ? ` · de ${fmtDay(c.date)}` : ''}</small>
      </div>
      <${Points} n=${c.points} class=${cx(c.status === 'approved' && 'won')} />
    </div>
    ${action}
    ${sheet === 'record' && html`<${EvidenceSheet} c=${c} onClose=${() => setSheet(null)} />`}
    ${sheet === 'review' && html`<${ReviewSheet} c=${c} onClose=${() => setSheet(null)} />`}
  </article>`;
}

// ============ grabar o elegir evidencia ============
const REC_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'];

function EvidenceSheet({ c, onClose }) {
  const live = useRef();
  const review = useRef();
  const stream = useRef(null);
  const rec = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const file = useRef();
  const [facing, setFacing] = useState('user');
  const [phase, setPhase] = useState('idle'); // idle | count | rec | done
  const [count, setCount] = useState(3);
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const stopCamera = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => () => { stopCamera(); clearInterval(timer.current); }, []);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    if (!canRecord || blob) return;
    let off = false;
    stopCamera();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then((s) => { if (off) { s.getTracks().forEach((t) => t.stop()); return; } stream.current = s; if (live.current) { live.current.srcObject = s; live.current.play().catch(() => {}); } })
      .catch(() => setErr('No pude abrir la cámara. Revisa el permiso del navegador o elige un archivo.'));
    return () => { off = true; };
  }, [facing, blob, canRecord]);

  const finish = (b) => { clearInterval(timer.current); stopCamera(); setBlob(b); setUrl(URL.createObjectURL(b)); setPhase('done'); };

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
      const r = new MediaRecorder(stream.current, { ...(mimeType && { mimeType }), videoBitsPerSecond: 1_000_000 });
      rec.current = r;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => finish(new Blob(chunks.current, { type: (r.mimeType || mimeType || 'video/webm').split(';')[0] }));
      r.start(250);
      setPhase('rec'); setSecs(0);
      const t0 = Date.now();
      timer.current = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setSecs(s); if (s >= 20) stopRec(); }, 250);
    }, 1000);
  };
  const stopRec = () => { clearInterval(timer.current); if (rec.current?.state === 'recording') rec.current.stop(); };

  const pick = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    try {
      if (f.type.startsWith('image/')) finish(await processImage(f, { max: 1080, quality: 0.8 }));
      else if (f.size > MAX_MB * 1e6) setErr(`Ese video pesa ${(f.size / 1e6).toFixed(1)} MB (máximo ${MAX_MB}). Grábalo aquí en la app, que lo comprime.`);
      else finish(f);
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
  return html`<${Sheet} title="Tu evidencia" full onClose=${onClose}>
    <p class="muted"><b>${c.title}</b> · ${(c.points)} puntos de amor. Grábate haciéndolo (hasta 20 s) o sube una foto.</p>
    <div class=${cx('cam', phase)}>
      ${phase === 'done'
        ? (isVideo ? html`<video ref=${review} src=${url} controls playsinline muted></video>` : html`<img src=${url} alt="Tu evidencia" />`)
        : canRecord && !err.startsWith('No pude abrir') ? html`<video ref=${live} playsinline muted autoplay class=${facing === 'user' ? 'mirror' : ''}></video>` : html`<div class="cam-off"><${Icon} name="camera" size=${34} /><span>Cámara no disponible</span></div>`}
      ${phase === 'count' && html`<div class="countdown" key=${count}>${count}</div>`}
      ${phase === 'rec' && html`<div class="rec-badge"><i></i>${secs}s</div>`}
    </div>
    ${err && html`<p class="notice" role="alert">${err}</p>`}
    ${phase === 'done'
      ? html`<button class="btn primary block lg" disabled=${busy} onClick=${send}>${busy ? 'Enviando…' : 'Enviar evidencia'}</button><button class="btn tinted block" onClick=${retry} disabled=${busy}>Repetir</button>`
      : html`<div class="rec-row">
          ${canRecord && phase === 'idle' && html`<button class="icon-btn lg" onClick=${() => setFacing(facing === 'user' ? 'environment' : 'user')} aria-label="Girar cámara"><${Icon} name="repeat" size=${20} /></button>`}
          ${canRecord && html`<button class=${cx('rec-btn', phase === 'rec' && 'on')} onClick=${phase === 'rec' ? stopRec : startRec} disabled=${phase === 'count'} aria-label=${phase === 'rec' ? 'Detener grabación' : 'Grabar'}><i></i></button>`}
          <button class="icon-btn lg" onClick=${() => file.current.click()} aria-label="Elegir del carrete"><${Icon} name="image" size=${20} /></button>
        </div>
        <p class="muted small center">${phase === 'rec' ? 'Grabando… toca el botón para detener' : 'Toca el círculo para grabar (cuenta de 3). A la derecha, elige una foto o video del carrete.'}</p>`}
    <input ref=${file} type="file" accept="image/*,video/*" hidden onChange=${pick} />
  <//>`;
}

// ============ revisar y aprobar ============
function ReviewSheet({ c, onClose }) {
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

  return html`<${Sheet} title=${c.title} onClose=${onClose}>
    <p class="muted">${nameOf(c.to)} envió su evidencia. Si de verdad lo hizo, apruébalo y recibirá <b>${c.points} puntos de amor</b>.</p>
    <div class="cam done">
      ${!src ? html`<div class="spinner"></div>` : c.evidence?.kind === 'video' ? html`<video src=${src} controls playsinline></video>` : html`<img src=${src} alt="Evidencia" />`}
    </div>
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
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await S.createChallenge({ title, points: L.num(points), date: L.ymd() });
    setBusy(false);
    if (r.ok) { toast(`Reto enviado a ${partner?.name}`, { icon: '🎯' }); onClose(); } else toast(r.data.error, { icon: '⚠️' });
  };
  return html`<${Sheet} title=${`Retar a ${partner?.name || 'tu pareja'}`} onClose=${onClose}>
    <div class="idea-chips">${IDEAS.map((i) => html`<button class=${cx('chip pick', title === i && 'on')} onClick=${() => setTitle(i)}>${i}</button>`)}</div>
    <form class="stack" onSubmit=${send}>
      <${Field} label="El reto de hoy"><input value=${title} onInput=${(e) => setTitle(e.target.value)} maxlength="80" required placeholder="Ej. 10 flexiones" /><//>
      <${Field} label="Puntos de amor que gana al cumplirlo"><${Stepper} value=${points} onChange=${setPoints} step=${5} min=${1} label="Puntos" /><//>
      <p class="muted small">Tendrá que grabarse o enviar una foto como evidencia. Tú decides si lo aprueban.</p>
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
