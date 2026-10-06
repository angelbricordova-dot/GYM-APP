import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Flame, Photo, Segmented, LineChart, BarChart, Ring, Sheet, Field, Empty, toast, cx, fmtKg, fmtShort, fmtDay } from './kit.js';
import { Calendar, DaySheet } from './calendar.js';

const MONTH = (y, m) => { const t = new Date(y, m, 1).toLocaleDateString('es-MX', { month: 'long' }); return t[0].toUpperCase() + t.slice(1); };

export function Progress() {
  const me = S.state.me;
  const [tab, setTab] = useState('summary');
  return html`<div class="view-in">
    <header class="top large"><h1>Progreso</h1></header>
    <${Segmented} value=${tab} onChange=${setTab} options=${[{ id: 'summary', label: 'Resumen' }, { id: 'lifts', label: 'Ejercicios' }, { id: 'body', label: 'Cuerpo' }]} />
    ${tab === 'summary' && html`<${Summary} doc=${me} isMe />`}
    ${tab === 'lifts' && html`<${Lifts} me=${me} />`}
    ${tab === 'body' && html`<${Body} me=${me} />`}
  </div>`;
}

/** Resumen de un documento (el mío o el de mi pareja): análisis del mes, calendario, tendencia y fotos. */
export function Summary({ doc, isMe }) {
  const now = new Date();
  const [mo, setMo] = useState({ y: now.getFullYear(), m: now.getMonth(), dir: 0 });
  const [day, setDay] = useState(null);
  const isCurrent = mo.y === now.getFullYear() && mo.m === now.getMonth();
  const shift = (d) => { const n = new Date(mo.y, mo.m + d, 1); if (n > new Date(now.getFullYear(), now.getMonth(), 1)) return; setMo({ y: n.getFullYear(), m: n.getMonth(), dir: d }); };
  const trend = L.monthlyCounts(doc, 6);

  return html`<div class="stack-lg">
    <div class="month-nav">
      <button class="icon-btn" onClick=${() => shift(-1)} aria-label="Mes anterior"><${Icon} name="left" size=${18} /></button>
      <b>${MONTH(mo.y, mo.m)} ${mo.y}</b>
      <button class="icon-btn" onClick=${() => shift(1)} disabled=${isCurrent} aria-label="Mes siguiente"><${Icon} name="right" size=${18} /></button>
    </div>
    <${MonthAnalysis} doc=${doc} y=${mo.y} m=${mo.m} isMe=${isMe} />
    <section class="card rise" style="--i:1"><${Calendar} doc=${doc} onDay=${setDay} month=${mo} onMonth=${setMo} hideHead /></section>
    <section class="card rise" style="--i:2">
      <h2>Últimos 6 meses</h2>
      <${BarChart} items=${trend.map((t, i) => ({ label: t.label, value: t.count, hot: i === trend.length - 1 }))} />
      <p class="muted small">Días de gym por mes: así se ve tu constancia con el paso del tiempo.</p>
    </section>
    <${StatGrid} doc=${doc} />
    <section class="card rise" style="--i:3"><h2>${isMe ? 'Mis fotos' : 'Sus fotos'}</h2><${Gallery} doc=${doc} onDay=${setDay} /></section>
    ${day && html`<${DaySheet} doc=${doc} date=${day} isMe=${isMe} onClose=${() => setDay(null)} />`}
  </div>`;
}

/** “¿Cómo me fue este mes?”: días que fuiste, días que faltaste, semanas cumplidas y comparación con el mes anterior. */
export function MonthAnalysis({ doc, y, m, isMe = true }) {
  const r = L.monthReport(doc, y, m);
  const name = isMe ? 'Fuiste' : 'Fue';
  if (!r) return null;
  const diff = r.prev == null ? 0 : r.attended - r.prev;
  const fresh = r.expected === 0; // recién empiezas: aún no hay días “planeados” contra los que medirte
  const verdict = fresh ? (r.attended ? '¡Buen comienzo! Así se empieza.' : 'Tu primer día cuenta desde hoy.') : r.pct >= 100 ? '¡Meta del mes cumplida! 🎉' : r.pct >= 70 ? 'Vas muy bien, sigue así.' : r.pct >= 40 ? 'Hay margen para mejorar: una sesión más por semana lo cambia.' : r.attended ? 'Un mes tranquilo. El siguiente puede ser el tuyo.' : 'Aún sin entrenos este mes.';
  return html`<section class="card month rise">
    <div class="month-head">
      <div>
        <small class="muted">Meta: ${doc.weeklyGoal} días por semana</small>
        <div class="month-big"><b>${r.attended}</b><span>${fresh ? (r.attended === 1 ? 'día este mes' : 'días este mes') : `de ${r.expected} días`}</span></div>
        <p class="verdict">${verdict}</p>
      </div>
      ${!fresh && html`<${Ring} value=${r.attended} max=${r.expected} size=${92} stroke=${10}><b class="ring-sm">${r.pct}%</b><//>`}
    </div>
    <ul class="facts">
      <li><${Icon} name="check" size=${16} sw=${2.6} /> ${name} <b>${r.attended}</b> ${r.attended === 1 ? 'día' : 'días'}${r.paused ? ` (con ${r.paused} en pausa)` : ''}</li>
      ${!fresh && html`<li class=${cx(r.missed > 0 && 'miss')}><${Icon} name=${r.missed > 0 ? 'x' : 'check'} size=${16} sw=${2.6} /> ${r.missed > 0 ? html`${isMe ? 'Faltaste' : 'Faltó'} <b>${r.missed}</b> ${r.missed === 1 ? 'día' : 'días'} de los planeados` : 'No faltó ningún día planeado'}</li>`}
      ${r.prev != null && html`<li><${Icon} name="chart" size=${16} /> ${diff === 0 ? 'Igual que' : diff > 0 ? html`<b class="up">+${diff}</b> más que en` : html`<b class="down">${diff}</b> menos que en`} ${MONTH(...(m === 0 ? [y - 1, 11] : [y, m - 1])).toLowerCase()} (${r.prev})</li>`}
    </ul>
    <div class="weeks">${r.weeks.map((w, i) => html`<div class=${cx('wk', w.hit && 'hit', w.current && !w.hit && 'now')}>
      <div class="wk-bar"><i style=${`height:${Math.min(100, (w.count / w.goal) * 100)}%`}></i></div><b>${w.count}/${w.goal}</b><small>${w.current ? 'Esta' : `Sem ${i + 1}`}</small></div>`)}</div>
    <p class="muted small center">${r.weeksHit} de ${r.weeks.length} ${r.weeks.length === 1 ? 'semana cumplida' : 'semanas cumplidas'}${r.bestChain > 1 ? ` · mejor racha del mes: ${r.bestChain} días` : ''}</p>
    ${(r.sessions > 0 || r.topDays.length > 0) && html`<div class="kv">
      ${r.sessions > 0 && html`<div><b>${r.sessions}</b><small>entrenos con ejercicios</small></div><div><b>${r.sets}</b><small>series</small></div><div><b>${Math.round(r.volume).toLocaleString('es-MX')}</b><small>kg movidos</small></div>`}
      ${r.prs > 0 && html`<div><b>${r.prs}</b><small>récords</small></div>`}
      ${r.topDays.length > 0 && html`<div><b>${r.topDays.join(' y ')}</b><small>día favorito${r.avgTime ? ` · ${r.avgTime} h` : ''}</small></div>`}
    </div>`}
  </section>`;
}

/** Cifras de constancia de un documento. */
export function StatGrid({ doc }) {
  const info = L.streakInfo(doc);
  const h = L.habits(doc);
  return html`<div class="stats">
    <div class="stat"><span><${Flame} size=${18} /></span><b>${info.current}</b><small>racha actual</small></div>
    <div class="stat"><span>🏆</span><b>${info.longest}</b><small>mejor racha</small></div>
    <div class="stat"><span>📅</span><b>${info.total}</b><small>días de gym</small></div>
    <div class="stat"><span>🔁</span><b>${L.weekStreak(doc)}</b><small>semanas meta</small></div>
    <div class="stat"><span>⏰</span><b>${h.avgTime || '–'}</b><small>hora típica</small></div>
    <div class="stat"><span>📆</span><b>${h.topDays[0] || '–'}</b><small>día favorito</small></div>
  </div>`;
}

export function Gallery({ doc, onDay, limit = 12 }) {
  const days = Object.keys(doc.checkins).filter((d) => doc.checkins[d].photo).sort().reverse().slice(0, limit);
  if (!days.length) return html`<p class="muted small">Aquí irán las fotos del espejo, día tras día.</p>`;
  return html`<div class="gallery">${days.map((d) => html`<button class="g-item" onClick=${() => onDay(d)} aria-label=${`Foto del ${fmtDay(d)}`}><${Photo} uid=${doc.id} pid=${doc.checkins[d].photo} /><span>${fmtShort(d)}</span></button>`)}</div>`;
}

function Lifts({ me }) {
  const cat = L.exerciseCatalog(me);
  const [key, setKey] = useState(null);
  const sel = cat.find((c) => c.key === key) || cat[0];
  const sessions = [...me.sessions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (!cat.length) return html`<${Empty} icon="🏋️" title="Aún no hay entrenos" text="Cuando registres uno, aquí verás la gráfica de cada ejercicio y tu meta para la próxima vez." />`;
  const series = L.exerciseSeries(me, sel.key);
  const s = L.suggestNext(me, sel.name);
  const best = Math.max(...series.map((x) => x.top));
  const first = series[0]?.top || 0;
  return html`<div class="stack-lg">
    <section class="card rise">
      <div class="chips">${cat.map((c) => html`<button class=${cx('chip pick', c.key === sel.key && 'on')} onClick=${() => setKey(c.key)}>${c.name}</button>`)}</div>
      ${series.length > 1 && best > 0 && html`<p class="muted small">Desde ${fmtShort(series[0].date)}: <b class=${cx(best >= first ? 'up' : 'down')}>${best - first >= 0 ? '+' : ''}${Math.round((best - first) * 10) / 10} kg</b> en tu mejor serie.</p>`}
      <${LineChart} points=${series.map((x) => ({ label: fmtShort(x.date), y: x.top || x.reps }))} unit=${series.at(-1)?.top ? 'kg' : ''} />
      ${s && html`<div class="goal-row"><div class="grow"><b>Siguiente meta</b><small class="muted">Última vez ${fmtShort(s.last.date)}</small></div><div class=${cx('target-pill', s.up && 'up')}>${s.sets}×${s.reps}<small>${s.kg ? fmtKg(s.kg) : 'peso corporal'}</small>${s.up && html`<em>⬆ sube peso</em>`}</div></div>`}
    </section>
    <section class="card rise" style="--i:2">
      <h2>Historial</h2>
      ${sessions.map((x) => html`<article class="session">
        <div class="row-between"><b>${fmtDay(x.date)}</b><span class="muted small">${x.time}${x.durationMin ? ` · ${x.durationMin} min` : ''}</span></div>
        ${x.exercises.map((ex) => html`<div class="ex-line"><span>${ex.name}</span><small>${ex.sets.map((y) => `${y.reps}×${y.kg || 'PC'}`).join(' · ')}</small></div>`)}
        ${x.note && html`<p class="muted small">📝 ${x.note}</p>`}
        <button class="link danger" onClick=${() => { if (confirm('¿Eliminar este entrenamiento? Se revertirán sus puntos.')) S.deleteSession(x.id); }}>Eliminar</button>
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
      <div class="row-between"><h2>Peso corporal</h2><button class="btn tinted sm" onClick=${() => setSheet(true)}><${Icon} name="plus" size=${16} /> Registrar</button></div>
      ${w.length ? html`<div class="body-head"><b>${fmtKg(w.at(-1).kg)}</b>${w.length > 1 && html`<span class=${cx('delta', diff <= 0 ? 'down' : 'up')}>${diff > 0 ? '+' : ''}${Math.round(diff * 10) / 10} kg desde el inicio</span>`}${bmi && html`<small class="muted">IMC ${bmi.toFixed(1)}</small>`}</div>` : html`<p class="muted">Registra tu peso para ver cómo cambia.</p>`}
      <${LineChart} points=${w.map((x) => ({ label: fmtShort(x.date), y: x.kg }))} />
      <p class="muted small"><${Icon} name="lock" size=${12} /> ${me.shareWeight ? 'Tu pareja puede ver tu peso.' : 'Privado: tu pareja no ve tu peso (puedes cambiarlo en tu perfil).'}</p>
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
      <button class="btn primary block lg">Guardar</button>
    </form>
  <//>`;
}
