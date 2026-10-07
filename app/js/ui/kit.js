// Componentes base: iconos, llama, avatar, anillo, sheets arrastrables, toasts, steppers, gráficas.
import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import { num, parseYmd } from '../logic.js';

// ---------- formato ----------
export const fmtDay = (s) => parseYmd(s).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
export const fmtShort = (s) => parseYmd(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
export const fmtLong = (s) => parseYmd(s).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtKg = (v) => `${Math.round(v * 100) / 100} kg`;
export const fmtDur = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
export const cx = (...a) => a.filter(Boolean).join(' ');

// ---------- iconos ----------
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chart: 'M4 20V11M10 20V4M16 20v-6M22 20H2',
  dumbbell: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
  heart: 'M12 20.5s-8-4.8-8-10.2A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 8 2.3c0 5.4-8 10.2-8 10.2z',
  gift: 'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z',
  camera: 'M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  drop: 'M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16.5 4.4a3.5 3.5 0 0 1 0 6.2M18 14a6.5 6.5 0 0 1 3.5 6',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 1.5M9.5 2h5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  send: 'M21 3L3 11l7 2.5L13 21z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
  repeat: 'M17 3l4 4-4 4M3 11V9a2 2 0 0 1 2-2h16M7 21l-4-4 4-4M21 13v2a2 2 0 0 1-2 2H3',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  logout: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01',
  play: 'M8 5.5v13l10.5-6.5z',
  video: 'M3 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3zM16 11.5l5-3v7l-5-3',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4',
  note: 'M5 4h14v11l-5 5H5zM14 20v-5h5',
  stop: 'M7 7h10v10H7z',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  chevD: 'M5 9l7 7 7-7',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2',
  download: 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z',
};

export const Icon = ({ name, size = 22, sw = 1.8, fill, class: c }) => html`<svg class=${cx('icon', c)} width=${size} height=${size} viewBox="0 0 24 24" fill=${fill ? 'currentColor' : 'none'} fill-opacity=${fill === true ? 1 : fill || 0} stroke="currentColor" stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${PATHS[name]} /></svg>`;

/** Corazón relleno: la moneda de Lindwyrm (puntos de amor). */
export const Heart = ({ size = 16, class: c }) => html`<svg class=${cx('heart', c)} width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2s-8.6-5.1-8.6-11.3A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 8.6 2.8c0 6.2-8.6 11.3-8.6 11.3z" fill="currentColor" /></svg>`;

/** “❤ 120”: puntos de amor en una sola pieza que no se parte en dos renglones. */
export const Points = ({ n, size = 15, class: c }) => html`<span class=${cx('pts', c)}><${Heart} size=${size} />${n}</span>`;

export const Flame = ({ size = 24, lit = true, class: c }) => html`<svg class=${cx('flame', lit ? 'lit' : 'off', c)} width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true">
  <defs><linearGradient id="fg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3d6e" /><stop offset=".55" stop-color="#ff7a45" /><stop offset="1" stop-color="#ffc857" /></linearGradient></defs>
  <path class="fl-out" d="M12.2 1.8c.4 3.3 3 5 4.6 7.7 1.9 3.2 1.5 7.4-1.3 10-2.3 2.2-6 2.4-8.4.4-2.4-2-2.9-5.4-1.4-8.2.7-1.3 1.8-2.2 2.4-3.6.6 1.1.7 2.4 1.5 3.3.9-2.3.4-6.3 2.6-9.6z" fill="url(#fg)" />
  <path class="fl-in" d="M12.1 21.2c-2 0-3.5-1.5-3.4-3.4.1-1.8 1.4-2.7 2-4.2.9 1.1 1.3 1.9 1.9 2.7.5-.7.8-1.5.7-2.5 1.4 1.4 2.3 2.7 2.1 4.2-.2 1.9-1.6 3.2-3.3 3.2z" fill="#ffe6a8" opacity=".92" />
</svg>`;

// ---------- foto y avatar ----------
export function Photo({ uid, pid, class: c, alt = 'Foto', onClick }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    setSrc(null); setErr(false);
    if (uid && pid) S.loadPhoto(uid, pid).then((u) => live && (u ? setSrc(u) : setErr(true))).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [uid, pid]);
  if (src) return html`<img class=${cx('photo', c)} src=${src} alt=${alt} onClick=${onClick} />`;
  return html`<div class=${cx('photo ph', c, err && 'err')} role="img" aria-label=${alt}>${err ? html`<${Icon} name="image" size=${22} />` : null}</div>`;
}

/** Botón “Guardar en el dispositivo” para una foto/video que ya está en una URL local (blob:). */
export function SaveButton({ url, name, class: c = 'btn tinted block', label = 'Guardar en el dispositivo' }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!url || busy) return;
    setBusy(true);
    try {
      const blob = await (await fetch(url)).blob();
      const { saveToDevice, extOf } = await import('../photos.js');
      const r = await saveToDevice(blob, `${name}.${extOf(blob.type)}`);
      if (r !== 'cancel') toast(r === 'shared' ? 'Listo: elige “Guardar” en el menú' : 'Descargado en tu dispositivo', { icon: '💾' });
    } catch { toast('No pude guardarlo. Mantén presionada la imagen para guardarla.', { icon: '⚠️' }); }
    setBusy(false);
  };
  return html`<button class=${c} disabled=${!url || busy} onClick=${go}><${Icon} name="download" size=${18} /> ${busy ? 'Un momento…' : label}</button>`;
}

export const Avatar = ({ doc, size = 40, ring, class: c }) => {
  const color = doc?.color || '#8b7cff';
  const initial = (doc?.name || '?').trim().slice(0, 1).toUpperCase();
  return html`<span class=${cx('avatar', ring && 'ringed', c)} style=${`--c:${color};width:${size}px;height:${size}px;font-size:${size * 0.42}px`}>
    ${doc?.avatar ? html`<img src=${doc.avatar} alt=${doc.name} />` : initial}
  </span>`;
};

// ---------- anillo y números ----------
/** Anillos concéntricos animados (estilo “actividad”): cada uno es { value, max, color }. */
export function Rings({ rings, size = 168, stroke = 15, gap = 5, children }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  const mid = size / 2;
  return html`<div class="ring rings" style=${`width:${size}px;height:${size}px`}>
    <svg viewBox=${`0 0 ${size} ${size}`} aria-hidden="true">
      ${rings.map((rg, i) => {
        const r = mid - stroke / 2 - i * (stroke + gap), circ = 2 * Math.PI * r;
        const pct = Math.max(0, Math.min(1, rg.max ? rg.value / rg.max : 0));
        return html`<g>
          <circle cx=${mid} cy=${mid} r=${r} fill="none" stroke=${rg.color} stroke-opacity=".16" stroke-width=${stroke} />
          <circle class="ring-arc" cx=${mid} cy=${mid} r=${r} fill="none" stroke=${rg.color} stroke-width=${stroke} stroke-linecap="round" style=${`transition-delay:${i * 120}ms`}
            stroke-dasharray=${circ} stroke-dashoffset=${circ * (1 - (on ? Math.max(pct, pct > 0 ? 0.015 : 0) : 0))} transform=${`rotate(-90 ${mid} ${mid})`} />
        </g>`;
      })}
    </svg>
    <div class="ring-in">${children}</div>
  </div>`;
}

export function Ring({ value, max, size = 120, stroke = 12, color = 'var(--accent)', children, class: c }) {
  const [p, setP] = useState(0);
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  useEffect(() => { const id = requestAnimationFrame(() => setP(pct)); return () => cancelAnimationFrame(id); }, [pct]);
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, mid = size / 2;
  return html`<div class=${cx('ring', c)} style=${`width:${size}px;height:${size}px`}>
    <svg viewBox=${`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx=${mid} cy=${mid} r=${r} fill="none" stroke="var(--track)" stroke-width=${stroke} />
      <circle class="ring-arc" cx=${mid} cy=${mid} r=${r} fill="none" stroke=${color} stroke-width=${stroke} stroke-linecap="round"
        stroke-dasharray=${circ} stroke-dashoffset=${circ * (1 - p)} transform=${`rotate(-90 ${mid} ${mid})`} />
    </svg>
    <div class="ring-in">${children}</div>
  </div>`;
}

/** Cuenta hacia el nuevo valor (los números que suben dan sensación de progreso). */
/** “1 punto” / “5 puntos”. */
export const puntos = (n) => `${n} ${Math.abs(n) === 1 ? 'punto' : 'puntos'}`;

export function CountUp({ value, ms = 700, dec = 0 }) {
  const f = 10 ** dec;
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); from.current = value; return; }
    const a = from.current, b = value, t0 = performance.now();
    let id;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
      setShown(Math.round((a + (b - a) * e) * f) / f);
      if (k < 1) id = requestAnimationFrame(tick); else from.current = b;
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return dec ? shown.toFixed(dec) : shown;
}

// ---------- sheets ----------
let locks = 0;
const lock = (on) => { locks += on ? 1 : -1; document.body.classList.toggle('locked', locks > 0); };

/** Panel inferior: se arrastra hacia abajo para cerrar (con velocidad) y respeta el área segura. */
export function Sheet({ onClose, title, children, full, right }) {
  const [shown, setShown] = useState(false);
  const el = useRef();
  const drag = useRef(null);

  useEffect(() => {
    lock(true);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => { cancelAnimationFrame(id); lock(false); };
  }, []);

  const close = () => { setShown(false); setTimeout(onClose, 320); };
  const down = (e) => {
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    el.current.style.transition = 'none';
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    el.current.style.transform = `translateY(${d.dy}px)`;
  };
  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const v = d.dy / Math.max(1, performance.now() - d.t0); // px/ms
    el.current.style.transition = '';
    if (d.dy > 110 || v > 0.6) { el.current.style.transform = 'translateY(100%)'; setShown(false); setTimeout(onClose, 320); }
    else el.current.style.transform = '';
  };

  return html`<div class=${cx('overlay', shown && 'show')}>
    <div class="backdrop" onClick=${close}></div>
    <div class=${cx('sheet', full && 'full')} ref=${el} role="dialog" aria-label=${title}>
      <div class="sheet-grab" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
        <i></i>
        <div class="sheet-title"><h2>${title}</h2>${right || html`<button class="icon-btn" onClick=${close} aria-label="Cerrar"><${Icon} name="x" size=${18} /></button>`}</div>
      </div>
      <div class="sheet-body">${typeof children === 'function' ? children(close) : children}</div>
    </div>
  </div>`;
}

// ---------- toasts ----------
let toastSet = null;
export function toast(msg, opts = {}) { toastSet?.({ msg, icon: opts.icon, id: Date.now(), kind: opts.kind }); }
export function ToastHost() {
  const [t, setT] = useState(null);
  useEffect(() => { toastSet = setT; return () => { toastSet = null; }; }, []);
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), 2600); return () => clearTimeout(id); }, [t]);
  return html`<div class="toast-host" aria-live="polite">${t && html`<div class=${cx('toast', t.kind)} key=${t.id}>${t.icon && html`<span>${t.icon}</span>`}${t.msg}</div>`}</div>`;
}

// ---------- controles ----------
export const Segmented = ({ options, value, onChange }) => html`<div class="seg" role="tablist">
  ${options.map((o) => html`<button type="button" role="tab" class=${cx(value === o.id && 'on')} aria-selected=${value === o.id} onClick=${() => onChange(o.id)}>${o.label}${o.badge ? html`<b class="dot-badge">${o.badge}</b>` : null}</button>`)}
</div>`;

const round = (n) => Math.round(n * 100) / 100;
export function Stepper({ value, onChange, step = 1, min = 0, decimal, label, placeholder = '0' }) {
  const bump = (d) => onChange(String(round(Math.max(min, num(value) + d * step))));
  return html`<div class="stepper">
    <button type="button" class="st-btn" onClick=${() => bump(-1)} aria-label=${`Menos ${label || ''}`}><${Icon} name="minus" size=${16} sw=${2.4} /></button>
    <input inputmode=${decimal ? 'decimal' : 'numeric'} enterkeyhint="done" value=${value} placeholder=${placeholder} aria-label=${label}
      onInput=${(e) => onChange(e.target.value)} onFocus=${(e) => e.target.select()} />
    <button type="button" class="st-btn" onClick=${() => bump(1)} aria-label=${`Más ${label || ''}`}><${Icon} name="plus" size=${16} sw=${2.4} /></button>
  </div>`;
};

/** Campo numérico de una serie: número grande, unidad debajo y − / + a los lados. */
export function NumField({ value, onChange, step = 1, min = 0, decimal, unit, label, placeholder = '0', done }) {
  const bump = (d) => onChange(String(round(Math.max(min, num(value) + d * step))));
  return html`<div class=${cx('numf', done && 'done')}>
    <button type="button" class="nf-btn" onClick=${() => bump(-1)} aria-label=${`Menos ${label}`}><${Icon} name="minus" size=${15} sw=${2.6} /></button>
    <label class="nf-mid">
      <input class=${cx(String(value).length > 4 && 'long')} inputmode=${decimal ? 'decimal' : 'numeric'} enterkeyhint="done" value=${value} placeholder=${placeholder} aria-label=${label}
        onInput=${(e) => onChange(e.target.value)} onFocus=${(e) => e.target.select()} />
      <span class="nf-unit">${unit}</span>
    </label>
    <button type="button" class="nf-btn" onClick=${() => bump(1)} aria-label=${`Más ${label}`}><${Icon} name="plus" size=${15} sw=${2.6} /></button>
  </div>`;
}

export const Field = ({ label, children, hint }) => html`<label class="field"><span>${label}</span>${children}${hint ? html`<small>${hint}</small>` : null}</label>`;

export const Empty = ({ icon, title, text, action }) => html`<div class="empty"><div class="empty-ic">${icon}</div><b>${title}</b><p>${text}</p>${action}</div>`;

// ---------- celebración ----------
const CONFETTI = ['#ff7a45', '#ffc857', '#ff3d6e', '#8b7cff', '#2dd4a7', '#38bdf8'];
export const Confetti = ({ n = 28 }) => html`<div class="confetti" aria-hidden="true">
  ${Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.3, d = 90 + ((i * 37) % 120);
    return html`<i style=${`--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 40}px;--r:${(i * 53) % 360}deg;--c:${CONFETTI[i % CONFETTI.length]};--d:${(i % 5) * 30}ms`}></i>`;
  })}
</div>`;

// ---------- gráficas ----------
export function LineChart({ points, unit = '', height = 150, color = 'var(--accent)' }) {
  if (points.length < 2) return html`<p class="muted small">Con 2 registros o más aparece tu gráfica.</p>`;
  const W = 320, H = height, L = 36, R = 10, T = 12, B = 22;
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.18;
  lo -= pad; hi += pad;
  const x = (i) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;
  const f = (v) => String(Math.round(v * 10) / 10);
  return html`<svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Gráfica de progreso">
    <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color=${color} stop-opacity=".28" /><stop offset="1" stop-color=${color} stop-opacity="0" /></linearGradient></defs>
    <path d=${area} fill="url(#area)" />
    <path class="draw" pathLength="1" d=${path} fill="none" stroke=${color} stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx=${x(points.length - 1)} cy=${y(points.at(-1).y)} r="4.5" fill=${color} />
    <text x=${L - 6} y=${T + 4} text-anchor="end">${f(hi - pad)}${unit}</text>
    <text x=${L - 6} y=${H - B} text-anchor="end">${f(lo + pad)}${unit}</text>
    <text x=${L} y=${H - 5}>${points[0].label}</text>
    <text x=${W - R} y=${H - 5} text-anchor="end">${points.at(-1).label}</text>
  </svg>`;
}

export function BarChart({ items, max, goal }) {
  const top = max || Math.max(1, ...items.map((i) => i.value));
  return html`<div class="bars">${items.map((i, idx) => html`<div class="bar-col">
    <div class="bar-track">
      ${goal ? html`<i class="goal" style=${`bottom:${Math.min(100, (goal / top) * 100)}%`}></i>` : null}
      <div class=${cx('bar', i.hot && 'hot')} style=${`height:${Math.max(3, Math.min(100, (i.value / top) * 100))}%;--i:${idx}`}></div>
    </div><small>${i.label}</small></div>`)}</div>`;
}
