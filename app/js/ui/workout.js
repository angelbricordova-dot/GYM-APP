import { html, useState, useEffect, useMemo } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Sheet, Stepper, Field, Points, toast, fmtDur, fmtKg, fmtShort, cx } from './kit.js';
import { closeScreen, replaceScreen, openScreen } from './nav.js';
import { haptic } from '../theme.js';

const uid = L.uid;
const REST_KEY = 'gymduo.rest';
const restDefault = () => { try { return Number(localStorage.getItem(REST_KEY)) || 90; } catch { return 90; } };

const draftFrom = (names, doc) => ({
  startedAt: Date.now(),
  note: '',
  exercises: names.map((n) => newExercise(n, doc)),
});

/** Arranca un entreno con esos ejercicios (ya con la meta de la vez pasada) y abre la pantalla de entreno. */
export function beginWorkout(names) {
  S.setDraft(draftFrom(names, S.state.me));
  openScreen('workout');
}

function newExercise(name, doc) {
  const s = L.suggestNext(doc, name);
  const n = s ? s.sets : 3;
  return { id: uid(), name, sets: Array.from({ length: n }, () => ({ id: uid(), kg: s ? String(s.kg) : '', reps: s ? String(s.reps) : '', done: false })) };
}

/** Entreno en vivo: pensado para usarse con una mano, entre series. */
export function Workout() {
  const doc = S.state.me;
  const draft = S.state.draft;
  const [picker, setPicker] = useState(false);
  const [finish, setFinish] = useState(false);
  const [rest, setRest] = useState(null); // { endsAt, total }
  const [, tick] = useState(0);

  // un reloj para el cronómetro y el descanso
  useEffect(() => { const id = setInterval(() => tick((v) => v + 1), 500); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (rest && Date.now() >= rest.endsAt + 6000) setRest(null);
  });

  const edit = (fn) => { const d = structuredClone(draft); fn(d); S.setDraft(d); };
  if (!draft) return null; // el entreno se empieza desde Entrenar u Hoy

  const elapsed = Math.floor((Date.now() - draft.startedAt) / 1000);
  const doneSets = draft.exercises.reduce((a, ex) => a + ex.sets.filter((s) => s.done).length, 0);
  const left = rest ? Math.ceil((rest.endsAt - Date.now()) / 1000) : 0;

  const toggleSet = (exId, setId) => {
    const ex = draft.exercises.find((e) => e.id === exId);
    const st = ex.sets.find((s) => s.id === setId);
    if (!st.done && !(L.num(st.reps) > 0)) { toast('Pon las repeticiones primero', { icon: '☝️' }); return; }
    haptic();
    edit((d) => { const s = d.exercises.find((e) => e.id === exId).sets.find((s) => s.id === setId); s.done = !s.done; });
    if (!st.done) { const total = restDefault(); setRest({ endsAt: Date.now() + total * 1000, total }); }
  };

  return html`<div class="screen workout">
    <div class="screen-top">
      <button class="icon-btn" onClick=${closeScreen} aria-label="Minimizar entreno"><${Icon} name="chevD" size=${20} /></button>
      <div class="w-clock"><span>${fmtDur(elapsed)}</span><small>${doneSets} series hechas</small></div>
      <button class="btn primary sm" onClick=${() => setFinish(true)}>Terminar</button>
    </div>

    <div class="screen-body">
      ${draft.exercises.map((ex) => html`<${ExerciseCard} key=${ex.id} ex=${ex} doc=${doc} edit=${edit} toggle=${toggleSet} />`)}
      <button class=${cx('btn block add-ex', draft.exercises.length === 0 && 'primary lg')} onClick=${() => setPicker(true)}><${Icon} name="plus" size=${18} /> Agregar ejercicio</button>
      ${draft.exercises.length === 0 && html`<p class="muted small center">Elige tus ejercicios y toca ✓ al terminar cada serie.</p>`}
      <div class="spacer"></div>
    </div>

    ${rest && html`<div class=${cx('rest', left <= 0 && 'ready')}>
      <${Icon} name="timer" size=${18} />
      <b>${left > 0 ? fmtDur(left) : '¡A la siguiente!'}</b>
      ${left > 0 && html`<button onClick=${() => setRest({ ...rest, endsAt: rest.endsAt - 15000 })}>−15</button><button onClick=${() => setRest({ ...rest, endsAt: rest.endsAt + 15000 })}>+15</button>`}
      <button onClick=${() => setRest(null)} aria-label="Cerrar descanso"><${Icon} name="x" size=${16} /></button>
    </div>`}

    ${picker && html`<${ExercisePicker} doc=${doc} added=${draft.exercises.map((e) => L.keyOf(e.name))} onAdd=${(name) => edit((d) => d.exercises.push(newExercise(name, doc)))} onClose=${() => setPicker(false)} />`}
    ${finish && html`<${FinishSheet} draft=${draft} doc=${doc} edit=${edit} onClose=${() => setFinish(false)} />`}
  </div>`;
}

function ExerciseCard({ ex, doc, edit, toggle }) {
  const sug = useMemo(() => L.suggestNext(doc, ex.name), [ex.name, doc.sessions.length]);
  const prev = sug?.last.sets || [];
  const complete = ex.sets.length > 0 && ex.sets.every((s) => s.done);
  const [open, setOpen] = useState(null); // null = automático: se pliega al completarse
  const expanded = open ?? !complete;
  if (!expanded) {
    const top = Math.max(...ex.sets.map((s) => L.num(s.kg)));
    return html`<button class="ex-done" onClick=${() => setOpen(true)}>
      <span class="ex-done-ic"><${Icon} name="check" size=${16} sw=${3} /></span>
      <span class="grow"><b>${ex.name}</b><small class="muted">${ex.sets.length} series${top ? ` · hasta ${top} kg` : ''}</small></span>
      <${Icon} name="chevD" size=${16} />
    </button>`;
  }
  const upd = (setId, field) => (v) => edit((d) => { d.exercises.find((e) => e.id === ex.id).sets.find((s) => s.id === setId)[field] = v; });
  return html`<section class=${cx('ex-card', complete && 'complete')}>
    <header>
      <div><b>${ex.name}</b>
        ${sug ? html`<small class=${cx('target', sug.up && 'up')}>Meta: ${sug.sets}×${sug.reps}${sug.kg ? ` · ${fmtKg(sug.kg)}` : ''}${sug.up ? ' ⬆ sube peso' : ''}</small>` : html`<small class="muted">Primera vez: anota y la próxima te doy la meta</small>`}
      </div>
      <button class="icon-btn" onClick=${() => { if (confirm(`¿Quitar ${ex.name} del entreno?`)) edit((d) => { d.exercises = d.exercises.filter((e) => e.id !== ex.id); }); }} aria-label="Quitar ejercicio"><${Icon} name="trash" size=${17} /></button>
    </header>
    <div class="sets-head"><span>Serie</span><span>Kg</span><span>Reps</span><span>✓</span></div>
    ${ex.sets.map((s, i) => html`<div class=${cx('set-row', s.done && 'done')} key=${s.id}>
      <div class="set-id"><span class="set-n">${i + 1}</span><span class="set-prev">${prev[i] ? `${prev[i].reps}×${prev[i].kg || 'PC'}` : ''}</span></div>
      <${Stepper} value=${s.kg} onChange=${upd(s.id, 'kg')} step=${2.5} decimal label="Kilos" />
      <${Stepper} value=${s.reps} onChange=${upd(s.id, 'reps')} step=${1} label="Repeticiones" />
      <button class=${cx('tick', s.done && 'on')} onClick=${() => toggle(ex.id, s.id)} aria-label=${s.done ? 'Desmarcar serie' : 'Marcar serie hecha'} aria-pressed=${s.done}><${Icon} name="check" size=${18} sw=${3} /></button>
    </div>`)}
    <footer>
      <button class="link" onClick=${() => edit((d) => { const e = d.exercises.find((x) => x.id === ex.id); const l = e.sets.at(-1) || { kg: '', reps: '' }; e.sets.push({ id: uid(), kg: l.kg, reps: l.reps, done: false }); })}>Agregar serie</button>
      ${ex.sets.length > 1 && html`<button class="link muted" onClick=${() => edit((d) => { d.exercises.find((x) => x.id === ex.id).sets.pop(); })}>− Quitar última</button>`}
    </footer>
  </section>`;
}

function ExercisePicker({ doc, added, onAdd, onClose }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('Todos');
  const cat = L.exerciseCatalog(doc);
  const known = new Map(cat.map((c) => [c.key, c]));
  const term = L.keyOf(q);
  const match = (n) => !term || L.keyOf(n).includes(term);
  const groups = ['Todos', ...L.LIBRARY.map(([g]) => g)];
  const inGroup = (n) => group === 'Todos' || L.LIBRARY.find(([g]) => g === group)[1].some((x) => L.keyOf(x) === L.keyOf(n));
  const recents = cat.filter((c) => match(c.name) && inGroup(c.name));
  const lib = L.LIBRARY.filter(([g]) => group === 'Todos' || g === group)
    .map(([g, names]) => [g, names.filter((n) => !known.has(L.keyOf(n)) && match(n))]).filter(([, n]) => n.length);
  const exact = known.has(term) || L.LIBRARY.some(([, n]) => n.some((x) => L.keyOf(x) === term));
  const lastTxt = (name) => { const s = L.suggestNext(doc, name); return s ? `Meta: ${s.sets}×${s.reps}${s.kg ? ` · ${fmtKg(s.kg)}` : ''}` : ''; };
  const Row = ({ name, sub }) => {
    const on = added.includes(L.keyOf(name));
    return html`<button class=${cx('pick-row', on && 'on')} onClick=${() => { if (!on) { haptic(); onAdd(name); } }}>
      <span><b>${name}</b>${sub && html`<small>${sub}</small>`}</span>
      <span class="pick-plus">${on ? html`<${Icon} name="check" size=${18} sw=${3} />` : html`<${Icon} name="plus" size=${18} sw=${2.4} />`}</span>
    </button>`;
  };
  return html`<${Sheet} title="Agregar ejercicio" full onClose=${onClose}>
    <input class="search" type="search" placeholder="Buscar o escribir uno nuevo" value=${q} onInput=${(e) => setQ(e.target.value)} enterkeyhint="search" />
    <div class="chips">${groups.map((g) => html`<button class=${cx('chip pick', group === g && 'on')} onClick=${() => setGroup(g)}>${g}</button>`)}</div>
    ${term && !exact && html`<button class="pick-row new" onClick=${() => { onAdd(q.trim()); setQ(''); }}><span><b>Crear “${q.trim()}”</b><small>Ejercicio nuevo</small></span><span class="pick-plus"><${Icon} name="plus" size=${18} sw=${2.4} /></span></button>`}
    ${recents.length > 0 && html`<h3 class="sec-h">Tus ejercicios</h3>${recents.map((c) => html`<${Row} name=${c.name} sub=${lastTxt(c.name)} />`)}`}
    ${lib.map(([g, names]) => html`<h3 class="sec-h">${g}</h3>${names.map((n) => html`<${Row} name=${n} />`)}`)}
    <button class="btn primary block lg sticky-done" onClick=${onClose}>Listo${added.length ? ` · ${added.length} en el entreno` : ''}</button>
  <//>`;
}

function FinishSheet({ draft, doc, edit, onClose }) {
  const [asRoutine, setAsRoutine] = useState(false);
  const [rName, setRName] = useState('');
  const sets = draft.exercises.flatMap((e) => e.sets);
  const done = sets.filter((s) => s.done).length;
  const unticked = sets.filter((s) => !s.done && L.num(s.reps) > 0).length;
  const durationMin = Math.max(1, Math.round((Date.now() - draft.startedAt) / 60000));
  const preview = {
    id: 'preview',
    exercises: draft.exercises.map((e) => ({ name: e.name, sets: e.sets.filter((s) => s.done).map((s) => ({ kg: L.num(s.kg), reps: Math.round(L.num(s.reps)) })) })).filter((e) => e.sets.length),
  };
  const prs = L.findPRs(doc, preview);
  const volume = L.sessionVolume(preview);

  const save = (withPhoto) => {
    const s = S.saveSession({ ...draft, durationMin, date: L.ymd(), time: new Date(draft.startedAt).toTimeString().slice(0, 5) });
    if (!s) return;
    if (asRoutine && rName.trim()) S.saveRoutine({ id: uid(), name: rName.trim(), exercises: draft.exercises.map((e) => e.name) });
    S.setDraft(null);
    if (withPhoto) replaceScreen('checkin', { session: s });
    else { closeScreen(); toast('Entreno guardado sin foto: no cuenta para la racha', { icon: '💾' }); }
  };

  return html`<${Sheet} title="Terminar entreno" onClose=${onClose}>
    <div class="fin-stats">
      <div><b>${durationMin}</b><small>min</small></div>
      <div><b>${done}</b><small>series</small></div>
      <div><b>${Math.round(volume).toLocaleString('es-MX')}</b><small>kg movidos</small></div>
    </div>
    ${prs.length > 0 && html`<div class="pr-banner">🏆 ¡Récord en ${prs.join(', ')}! +${L.EARN.pr * prs.length} puntos de amor</div>`}
    ${unticked > 0 && html`<div class="notice">Tienes ${unticked} series con datos sin marcar ✓ (no cuentan). <button class="link" onClick=${() => edit((d) => d.exercises.forEach((e) => e.sets.forEach((s) => { if (L.num(s.reps) > 0) s.done = true; })))}>Marcar todas</button></div>`}
    <${Field} label="Nota (opcional)"><input value=${draft.note} onInput=${(e) => edit((d) => { d.note = e.target.value; })} placeholder="Cómo te sentiste…" /><//>
    <label class="check"><input type="checkbox" checked=${asRoutine} onChange=${(e) => setAsRoutine(e.target.checked)} /><span>Guardar como rutina</span></label>
    ${asRoutine && html`<input placeholder="Nombre (ej. Push, Pierna…)" value=${rName} onInput=${(e) => setRName(e.target.value)} />`}
    <button class="btn primary block lg" disabled=${done === 0} onClick=${() => save(true)}><${Icon} name="camera" size=${20} /> Guardar y tomar foto</button>
    <button class="btn block" disabled=${done === 0} onClick=${() => save(false)}>Guardar sin foto</button>
    ${done === 0 && html`<p class="muted small center">Marca al menos una serie con ✓ para guardar.</p>`}
    <button class="link danger" onClick=${() => { if (confirm('¿Descartar este entreno?')) { S.setDraft(null); closeScreen(); } }}>Descartar entreno</button>
  <//>`;
}
