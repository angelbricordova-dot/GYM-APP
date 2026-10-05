import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Flame, Photo, Segmented, LineChart, BarChart, Sheet, Field, Empty, toast, cx, fmtKg, fmtShort, fmtDay } from './kit.js';
import { Calendar, DaySheet } from './calendar.js';

export function Progress() {
  const me = S.state.me;
  const [tab, setTab] = useState('summary');
  return html`<div class="view-in">
    <header class="top"><div><small class="muted">Tu avance</small><h1>Progreso</h1></div></header>
    <${Segmented} value=${tab} onChange=${setTab} options=${[{ id: 'summary', label: 'Resumen' }, { id: 'lifts', label: 'Ejercicios' }, { id: 'body', label: 'Cuerpo' }]} />
    ${tab === 'summary' && html`<${Summary} me=${me} />`}
    ${tab === 'lifts' && html`<${Lifts} me=${me} />`}
    ${tab === 'body' && html`<${Body} me=${me} />`}
  </div>`;
}

/** Cifras de constancia de un documento (se reutiliza en la pantalla de pareja). */
export function StatGrid({ doc }) {
  const info = L.streakInfo(doc);
  const h = L.habits(doc);
  return html`<div class="stats">
    <div class="stat"><span><${Flame} size=${18} /></span><b>${info.current}</b><small>racha actual</small></div>
    <div class="stat"><span>🏆</span><b>${info.longest}</b><small>mejor racha</small></div>
    <div class="stat"><span>📅</span><b>${L.monthCount(doc)}</b><small>este mes</small></div>
    <div class="stat"><span>✅</span><b>${info.total}</b><small>días de gym</small></div>
    <div class="stat"><span>🔁</span><b>${L.weekStreak(doc)}</b><small>semanas meta</small></div>
    <div class="stat"><span>⏰</span><b>${h.avgTime || '–'}</b><small>hora típica</small></div>
  </div>`;
}

export function Gallery({ doc, onDay, limit = 12 }) {
  const days = Object.keys(doc.checkins).filter((d) => doc.checkins[d].photo).sort().reverse().slice(0, limit);
  if (!days.length) return html`<p class="muted small">Aquí irán las fotos del espejo, día tras día.</p>`;
  return html`<div class="gallery">${days.map((d) => html`<button class="g-item" onClick=${() => onDay(d)} aria-label=${`Foto del ${fmtDay(d)}`}><${Photo} uid=${doc.id} pid=${doc.checkins[d].photo} /><span>${fmtShort(d)}</span></button>`)}</div>`;
}

function Summary({ me }) {
  const [day, setDay] = useState(null);
  const h = L.habits(me);
  return html`<div class="stack-lg">
    <section class="card rise"><${Calendar} doc=${me} onDay=${setDay} /></section>
    <${StatGrid} doc=${me} />
    <section class="card rise" style="--i:2">
      <h2>Cuándo entrenas</h2>
      ${h.total ? html`<${BarChart} items=${h.perDay.map((v, i) => ({ label: L.DAY_INITIALS[i], value: v, hot: h.topDays.includes(L.DAY_NAMES[i]) }))} />
        <p class="muted small">Vas más los <b>${h.topDays.join(' y ')}</b>${h.avgTime ? ` · alrededor de las <b>${h.avgTime}</b>` : ''}.</p>` : html`<p class="muted">Aún no hay check-ins.</p>`}
    </section>
    <section class="card rise" style="--i:3"><h2>Mis fotos</h2><${Gallery} doc=${me} onDay=${setDay} /></section>
    ${day && html`<${DaySheet} doc=${me} date=${day} isMe onClose=${() => setDay(null)} />`}
  </div>`;
}

function Lifts({ me }) {
  const cat = L.exerciseCatalog(me);
  const [key, setKey] = useState(null);
  const sel = cat.find((c) => c.key === key) || cat[0];
  const series = sel ? L.exerciseSeries(me, sel.key) : [];
  const sessions = [...me.sessions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (!cat.length) return html`<${Empty} icon="🏋️" title="Aún no hay entrenos" text="Cuando registres uno, aquí verás la gráfica de cada ejercicio y tus metas." />`;
  const s = L.suggestNext(me, sel.name);
  return html`<div class="stack-lg">
    <section class="card rise">
      <div class="chips">${cat.map((c) => html`<button class=${cx('chip pick', c.key === sel.key && 'on')} onClick=${() => setKey(c.key)}>${c.name}</button>`)}</div>
      <${LineChart} points=${series.map((x) => ({ label: fmtShort(x.date), y: x.top || x.reps }))} unit=${series.at(-1)?.top ? 'kg' : ''} />
      ${s && html`<div class="goal-row"><div class="grow"><b>Siguiente meta</b><small class="muted">Última vez ${fmtShort(s.last.date)}</small></div><div class=${cx('target-pill', s.up && 'up')}>${s.sets}×${s.reps}<small>${s.kg ? fmtKg(s.kg) : 'peso corporal'}</small>${s.up && html`<em>⬆ sube peso</em>`}</div></div>`}
    </section>
    ${me.routines.length > 0 && html`<section class="card rise" style="--i:1"><h2>Mis rutinas</h2>${me.routines.map((r) => html`<div class="reward"><div class="grow"><b>${r.name}</b><small class="muted">${r.exercises.join(' · ')}</small></div><button class="icon-btn" onClick=${() => { if (confirm(`¿Eliminar la rutina ${r.name}?`)) S.deleteRoutine(r.id); }} aria-label="Eliminar rutina"><${Icon} name="trash" size=${16} /></button></div>`)}</section>`}
    <section class="card rise" style="--i:2">
      <h2>Historial</h2>
      ${sessions.map((x) => html`<article class="session">
        <div class="row-between"><b>${fmtDay(x.date)}</b><span class="muted small">${x.time}${x.durationMin ? ` · ${x.durationMin} min` : ''}</span></div>
        ${x.exercises.map((ex) => html`<div class="ex-line"><span>${ex.name}</span><small>${ex.sets.map((y) => `${y.reps}×${y.kg || 'PC'}`).join(' · ')}</small></div>`)}
        ${x.note && html`<p class="muted small">📝 ${x.note}</p>`}
        <button class="link danger" onClick=${() => { if (confirm('¿Eliminar este entrenamiento? Se revertirán sus tokens.')) S.deleteSession(x.id); }}>Eliminar</button>
      </article>`)}
    </section>
  </div>`;
}

function Body({ me }) {
  const [sheet, setSheet] = useState(false);
  const w = me.weights;
  const bmi = me.heightCm && w.length ? w.at(-1).kg / (me.heightCm / 100) ** 2 : null;
  const diff = w.length > 1 ? w.at(-1).kg - w[0].kg : 0;
  return html`<div class="stack-lg">
    <section class="card rise">
      <div class="row-between"><h2>Peso corporal</h2><button class="btn sm" onClick=${() => setSheet(true)}><${Icon} name="plus" size=${16} /> Registrar</button></div>
      ${w.length ? html`<div class="body-head"><b>${fmtKg(w.at(-1).kg)}</b>${w.length > 1 && html`<span class=${cx('delta', diff <= 0 ? 'down' : 'up')}>${diff > 0 ? '+' : ''}${Math.round(diff * 10) / 10} kg desde el inicio</span>`}${bmi && html`<small class="muted">IMC ${bmi.toFixed(1)}</small>`}</div>` : html`<p class="muted">Registra tu peso para ver cómo cambia.</p>`}
      <${LineChart} points=${w.map((x) => ({ label: fmtShort(x.date), y: x.kg }))} color="var(--accent)" />
      <p class="muted small"><${Icon} name="lock" size=${12} /> ${me.shareWeight ? 'Tu pareja puede ver tu peso.' : 'Privado: tu pareja no ve tu peso (puedes cambiarlo en Perfil).'}</p>
    </section>
    ${sheet && html`<${WeightSheet} onClose=${() => setSheet(false)} />`}
  </div>`;
}

function WeightSheet({ onClose }) {
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(L.ymd());
  return html`<${Sheet} title="Registrar peso" onClose=${onClose}>
    <form class="stack" onSubmit=${(e) => { e.preventDefault(); S.logWeight(kg, date); toast('Peso guardado', { icon: '⚖️' }); onClose(); }}>
      <div class="row2"><${Field} label="Peso (kg)"><input inputmode="decimal" value=${kg} onInput=${(e) => setKg(e.target.value)} required autofocus /><//><${Field} label="Fecha"><input type="date" value=${date} max=${L.ymd()} onInput=${(e) => setDate(e.target.value)} /><//></div>
      <button class="btn primary block">Guardar</button>
    </form>
  <//>`;
}
