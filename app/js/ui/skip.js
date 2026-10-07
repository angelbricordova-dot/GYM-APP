import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Sheet, Field, Stepper, toast, cx } from './kit.js';

const REASONS = ['Me dio flojera', 'Estoy cansado/a', 'Trabajo o estudio', 'Me siento mal', 'Imprevisto'];

/** “Hoy no fui”: la razón le llega a tu pareja y ella o él decide cuántos puntos de amor te quita (1 a 100). */
export function SkipSheet({ onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const partner = S.state.partner?.name || 'tu pareja';
  const send = async () => {
    setBusy(true);
    const r = await S.skipToday(reason);
    setBusy(false);
    if (!r.ok) return toast(r.data.error, { icon: '⚠️' });
    toast(r.sent ? `Se lo avisé a ${partner}` : 'Guardado; se enviará al reconectar', { icon: '😔' });
    onClose();
  };
  return html`<${Sheet} title="Hoy no fui" onClose=${onClose}>
    <div class="skip-warn"><span>😔</span><p><b>Esto cuesta puntos de amor.</b> ${partner} lee tu razón y decide cuántos te quita, de ${L.PENALTY.min} a ${L.PENALTY.max}. Si al final sí entrenas hoy, no se te quita nada.</p></div>
    ${!S.state.partner && html`<p class="muted small">Tu pareja aún no se une: queda guardado y, cuando entre, ella o él lo lee y decide cuántos puntos te quita.</p>`}
    <div class="chips">${REASONS.map((r) => html`<button class=${cx('chip pick', reason === r && 'on')} onClick=${() => setReason(r)}>${r}</button>`)}</div>
    <${Field} label="La razón (sé sincero)"><input value=${reason} onInput=${(e) => setReason(e.target.value)} maxlength="140" placeholder="No fui porque…" /><//>
    <button class="btn bad block lg" disabled=${!reason.trim() || busy} onClick=${send}><${Icon} name="send" size=${18} /> ${busy ? 'Enviando…' : `Avisar a ${partner}`}</button>
  <//>`;
}

/** Para quien recibe el aviso: elige cuántos puntos quitar. Razonable. */
export function PenaltyForm({ m, name }) {
  const [pts, setPts] = useState('10');
  const [busy, setBusy] = useState(false);
  const n = Math.round(L.num(pts));
  const ok = n >= L.PENALTY.min && n <= L.PENALTY.max;
  const go = async (points = n) => {
    if (busy || !(points >= 0)) return;
    setBusy(true);
    const r = await S.decidePenalty(m.id, points);
    setBusy(false);
    toast(r.ok ? (points ? `Le quitaste ${points} puntos de amor a ${name}` : `${name} se queda con todos sus puntos 💗`) : r.data.error, { icon: r.ok ? '⚖️' : '⚠️' });
  };
  return html`<div class="penalty">
    <small class="muted">¿Cuántos puntos de amor le quitas? (${L.PENALTY.min} a ${L.PENALTY.max}, que sea justo)</small>
    <${Stepper} value=${pts} onChange=${(v) => setPts(String(Math.min(L.PENALTY.max, L.num(v))))} step=${5} min=${0} label="Puntos a quitar" />
    <div class="chips">${[5, 10, 25, 50].map((x) => html`<button class=${cx('chip pick', n === x && 'on')} onClick=${() => setPts(String(x))}>${x}</button>`)}</div>
    <button class="btn bad block" disabled=${!ok || busy} onClick=${() => go(n)}>Quitar ${ok ? n : ''} puntos</button>
    <button class="btn tinted block" disabled=${busy} onClick=${() => go(0)}>💗 No quitar ningún punto</button>
  </div>`;
}

/** Tarjeta en Hoy para decidir un “hoy no fui” pendiente de mi pareja. */
export function SkipDecision({ m }) {
  const name = S.state.partner?.name || 'Tu pareja';
  const [hidden, setHidden] = useState(false); // se oculta hasta que abras la app otra vez; la decisión sigue pendiente
  if (hidden) return null;
  return html`<section class="card skip-card rise">
    <button class="icon-btn flat skip-x" onClick=${() => setHidden(true)} aria-label="Cerrar por ahora"><${Icon} name="x" size=${16} /></button>
    <div class="skip-card-h"><span>😔</span><div><b>${name} hoy no fue al gym</b><small class="muted">“${m.text}”</small></div></div>
    <${PenaltyForm} m=${m} name=${name} />
  </section>`;
}
