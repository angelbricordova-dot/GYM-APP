import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, fmtDay, fmtDur, cx } from './kit.js';
import { openScreen, goTab } from './nav.js';
import { beginWorkout } from './workout.js';
import { ShareRoutineSheet } from './routines.js';

/** Entrenar: el punto de partida. Un toque y ya estás anotando. */
export function Train() {
  const me = S.state.me;
  const draft = S.state.draft;
  const recent = [...me.sessions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const last = recent[0];
  const [, tick] = useState(0);
  const [share, setShare] = useState(null);
  const recommended = S.routinesNew();
  useEffect(() => { if (!draft) return; const id = setInterval(() => tick((v) => v + 1), 1000); return () => clearInterval(id); }, [!!draft]);

  return html`<div class="view-in">
    <header class="top large"><h1>Entrenar</h1></header>

    ${draft
      ? html`<button class="workout-hero live rise" onClick=${() => openScreen('workout')}>
          <span class="wh-eyebrow"><i class="live-dot"></i> Entreno en curso</span>
          <b>${fmtDur(Math.floor((Date.now() - draft.startedAt) / 1000))}</b>
          <small>${draft.exercises.length} ${draft.exercises.length === 1 ? 'ejercicio' : 'ejercicios'} · toca para continuar</small>
        </button>`
      : html`<button class="workout-hero rise" onClick=${() => beginWorkout([])}>
          <span class="wh-eyebrow">Hoy</span>
          <b>Empezar entreno</b>
          <small>Entreno libre · agrega ejercicios sobre la marcha</small>
          <span class="wh-go"><${Icon} name="play" size=${22} fill /></span>
        </button>`}

    ${recommended.length > 0 && html`<section class="rise" style="--i:1">
      <h3 class="sec-h">Recomendada por ${S.state.partner?.name}</h3>
      <div class="group">${recommended.map((r) => html`<${Row} icon="send" title=${r.name} sub=${`${L.routineItems(r).length} ejercicios${r.note ? ` · “${r.note}”` : ''}`} onClick=${() => goTab('together')} />`)}</div>
    </section>`}

    ${(me.routines.length > 0 || last) && html`<section class="rise" style="--i:1">
      <h3 class="sec-h">Con un toque</h3>
      <div class="group">
        ${last && html`<${Row} icon="repeat" title="Repetir el último" sub=${`${fmtDay(last.date)} · ${last.exercises.map((e) => e.name).join(', ')}`} onClick=${() => beginWorkout(last.exercises.map((e) => e.name))} />`}
        ${me.routines.map((r) => html`<${Row} icon="list" title=${r.name} sub=${L.routineItems(r).map((e) => e.name).join(', ')} onClick=${() => beginWorkout(L.routineItems(r))} trail=${html`${S.state.partner && html`<button class="icon-btn flat" onClick=${(e) => { e.stopPropagation(); setShare({ name: r.name, items: L.routineItems(r).map((x) => ({ name: x.name, sets: x.sets || 3, reps: x.reps || 10 })) }); }} aria-label=${`Recomendar ${r.name}`}><${Icon} name="send" size=${16} /></button>`}<button class="icon-btn flat" onClick=${(e) => { e.stopPropagation(); if (confirm(`¿Eliminar la rutina ${r.name}?`)) S.deleteRoutine(r.id); }} aria-label=${`Eliminar ${r.name}`}><${Icon} name="trash" size=${16} /></button>`} />`)}
      </div>
    </section>`}

    <section class="rise" style="--i:2">
      <h3 class="sec-h">Plantillas para empezar</h3>
      <div class="group">${L.TEMPLATES.map((t) => html`<${Row} icon="dumbbell" title=${t.name} sub=${t.sub} onClick=${() => beginWorkout(t.exercises)} />`)}</div>
      <p class="sec-f">Después de entrenar puedes guardar tu propia rutina. La app recuerda tus pesos y te sugiere cuánto subir.</p>
    </section>

    ${share && html`<${ShareRoutineSheet} preset=${share} onClose=${() => setShare(null)} />`}

    ${last && html`<section class="card rise last-session" style="--i:3">
      <div class="row-between"><div><small class="muted">Último entreno</small><b class="ls-when">${fmtDay(last.date)} · ${last.time} h</b></div><small class="muted">${last.durationMin ? `${last.durationMin} min` : ''}</small></div>
      <div class="ls-ex">${last.exercises.map((e) => html`<div class="ex-line"><span>${e.name}</span><small>${e.sets.map((y) => `${y.reps}×${y.kg || 'PC'}`).join(' · ')}</small></div>`)}</div>
      <div class="cta-row">
        <button class="btn tinted sm grow" disabled=${!!draft} onClick=${() => { if (S.beginEdit(last.id)) openScreen('workout'); }}><${Icon} name="pencil" size=${15} /> Editar</button>
        <button class="btn danger sm grow" onClick=${() => { if (confirm('¿Eliminar tu último entreno? Se revierten sus récords y puntos por récord (el check-in del día se queda).')) S.deleteSession(last.id); }}><${Icon} name="trash" size=${15} /> Eliminar</button>
      </div>
      ${draft && html`<small class="muted">Termina o descarta el entreno en curso para poder editar.</small>`}
    </section>`}

    ${recent.length > 0 && html`<section class="rise" style="--i:3">
      <h3 class="sec-h">Recientes</h3>
      <div class="group">${recent.slice(0, 3).map((x) => html`<div class="row static"><span class="lead"><${Icon} name="history" size=${18} /></span><div class="grow"><b>${fmtDay(x.date)}</b><small class="muted">${x.exercises.map((e) => e.name).join(', ')}</small></div><small class="muted">${x.durationMin ? `${x.durationMin} min` : ''}</small></div>`)}</div>
    </section>`}
  </div>`;
}

const Row = ({ icon, title, sub, onClick, trail }) => html`<div class="row" role="button" tabIndex="0" onClick=${onClick} onKeyDown=${(e) => e.key === 'Enter' && onClick()}>
  <span class="lead"><${Icon} name=${icon} size=${18} /></span>
  <div class="grow"><b>${title}</b>${sub && html`<small class="muted">${sub}</small>`}</div>
  ${trail || html`<${Icon} name="right" size=${16} class="chev" />`}
</div>`;
