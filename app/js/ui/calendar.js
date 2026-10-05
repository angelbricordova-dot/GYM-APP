import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Flame, Photo, Sheet, fmtLong, cx, toast, fmtKg } from './kit.js';

/** Calendario mensual de check-ins. Sirve para mi perfil y, en solo lectura, para el de mi pareja. */
export function Calendar({ doc, onDay }) {
  const now = new Date();
  const [m, setM] = useState({ y: now.getFullYear(), m: now.getMonth(), dir: 0 });
  const today = L.ymd();
  const info = L.streakInfo(doc);
  const inChain = new Set(info.chain);
  const weeks = L.monthGrid(m.y, m.m);
  const raw = new Date(m.y, m.m, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
  const title = raw[0].toUpperCase() + raw.slice(1);
  const shift = (d) => { const n = new Date(m.y, m.m + d, 1); setM({ y: n.getFullYear(), m: n.getMonth(), dir: d }); };
  const isCurrent = m.y === now.getFullYear() && m.m === now.getMonth();

  return html`<div class="cal">
    <div class="cal-head">
      <button class="icon-btn" onClick=${() => shift(-1)} aria-label="Mes anterior"><${Icon} name="left" size=${18} /></button>
      <b>${title}</b>
      <button class="icon-btn" onClick=${() => shift(1)} disabled=${isCurrent} aria-label="Mes siguiente"><${Icon} name="right" size=${18} /></button>
    </div>
    <div class="cal-dow">${L.DAY_INITIALS.map((d) => html`<span>${d}</span>`)}</div>
    <div class=${cx('cal-grid', m.dir > 0 && 'from-r', m.dir < 0 && 'from-l')} key=${`${m.y}-${m.m}`}>
      ${weeks.flat().map((c) => {
        const ck = doc.checkins[c.date];
        const paused = L.isPaused(doc, c.date);
        return html`<button class=${cx('cal-day', !c.inMonth && 'out', ck && 'on', ck && inChain.has(c.date) && 'chain', c.date === today && 'today', c.date > today && 'future', paused && 'paused')}
          disabled=${!ck} onClick=${() => onDay?.(c.date)} aria-label=${ck ? `Entrenó el ${fmtLong(c.date)}` : fmtLong(c.date)}>
          ${ck ? (inChain.has(c.date) ? html`<${Flame} size=${22} />` : html`<${Icon} name="check" size=${16} sw=${3} />`) : L.parseYmd(c.date).getDate()}
        </button>`;
      })}
    </div>
    <div class="cal-legend"><span><${Flame} size=${14} /> racha actual</span><span><${Icon} name="check" size=${12} sw=${3} /> entrenó</span><span class="lg-pause">pausa</span></div>
  </div>`;
}

/** Detalle de un día: foto del espejo, entreno y reacciones. */
export function DaySheet({ doc, date, isMe, onClose }) {
  const ck = doc.checkins[date];
  const me = S.state.auth.uid;
  const sessions = doc.sessions.filter((s) => s.date === date);
  const reactions = S.state.messages.filter((m) => m.kind === 'reaction' && m.ref?.uid === doc.id && m.ref?.date === date);
  const [sent, setSent] = useState([]);
  if (!ck) return null;

  const react = async (emoji) => {
    setSent([...sent, emoji]);
    const r = await S.sendMessage(emoji, 'reaction', { uid: doc.id, date });
    if (!r.ok) { setSent(sent); toast(r.data.error, { icon: '⚠️' }); }
  };

  return html`<${Sheet} title=${fmtLong(date)} onClose=${onClose}>
    ${ck.photo
      ? html`<${Photo} uid=${doc.id} pid=${ck.photo} class="day-photo" alt="Foto del espejo" />`
      : html`<div class="day-photo none"><${Icon} name="camera" size=${28} /><span>Sin foto</span></div>`}
    <div class="row-between"><b>${ck.time} h</b>${isMe && ck.photo && !ck.photoUp && html`<span class="chip warn">Subiendo cuando haya señal</span>`}</div>
    ${sessions.map((s) => html`<div class="mini-session">
      ${s.exercises.map((ex) => html`<div class="ex-line"><span>${ex.name}</span><small>${ex.sets.map((x) => `${x.reps}×${x.kg ? fmtKg(x.kg).replace(' kg', '') : 'PC'}`).join(' · ')}</small></div>`)}
    </div>`)}
    ${!sessions.length && html`<p class="muted small">Solo check-in, sin ejercicios registrados.</p>`}
    ${reactions.length > 0 && html`<div class="reacts">${reactions.map((r) => html`<span class="react">${r.text}</span>`)}</div>`}
    ${!isMe && html`<div class="react-bar"><span class="muted small">Reaccionar</span>${['🔥', '💪', '👏', '😍'].map((e) => html`<button class=${cx('react-btn', sent.includes(e) && 'sent')} onClick=${() => react(e)}>${e}</button>`)}</div>`}
    ${isMe && html`<button class="link danger" onClick=${() => { if (confirm('¿Eliminar este check-in? Se pierde ese día de la racha.')) { S.removeCheckin(date); onClose(); } }}>Eliminar check-in</button>`}
  <//>`;
}
