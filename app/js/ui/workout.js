import { html, useState, useEffect, useMemo } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Sheet, Stepper, Field, toast, fmtDur, fmtKg, fmtShort, cx } from './kit.js';
import { closeScreen, replaceScreen } from './nav.js';

const uid = L.uid;
const REST_KEY = 'gymduo.rest';
const restDefault = () => { try { return Number(localStorage.getItem(REST_KEY)) || 90; } catch { return 90; } };

const draftFrom = (names, doc) => ({
  startedAt: Date.now(),
  note: '',
  exercises: names.map((n) => newExercise(n, doc)),
});

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
  const start = (names) => S.setDraft(draftFrom(names, doc));

  if (!draft) return html`<${Starter} doc=${doc} onStart=${start} />`;

  const elapsed = Math.floor((Date.now() - draft.startedAt) / 1000);
  const doneSets = draft.exercises.reduce((a, ex) => a + ex.sets.filter((s) => s.done).length, 0);
  const left = rest ? Math.ceil((rest.endsAt - Date.now()) / 1000) : 0;

  const toggleSet = (exId, setId) => {
    const ex = draft.exercises.find((e) => e.id === exId);
    const st = ex.sets.find((s) => s.id === setId);
    if (!st.done && !(L.num(st.reps) > 0)) { toast('Pon las repeticiones primero', { icon: '☝️' }); return; }
    edit((d) => { const s = d.exercises.find((e) => e.id === exId).sets.find((s) => s.id === setId); s.done = !s.done; });
    if (!st.done) { const total = restDefault(); setRest({ endsAt: Date.now() + total * 1000, total }); }
  };

  return html`<div class="screen workout">
    <div class="screen-top">
      <button class="icon-btn" onClick=${closeScreen} aria-label="Minimizar"><${Icon} name="left" size=${20} /></button>
      <div class="w-clock"><span>${fmtDur(elapsed)}</span><small>${doneSets} series hechas</small></div>
      <button class="btn primary sm" onClick=${() => setFinish(true)}>Terminar</button>
    </div>

    <div class="screen-body">
      ${draft.exercises.map((ex) => html`<${ExerciseCard} key=${ex.id} ex=${ex} doc=${doc} edit=${edit} toggle=${toggleSet} />`)}
      <button class="btn block add-ex" onClick=${() => setPicker(true)}><${Icon} name="plus" size=${18} /> Agregar ejercicio</button>
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

function Starter({ doc, onStart }) {
  const last = [...doc.sessions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  return html`<div class="screen workout">
    <div class="screen-top"><button class="icon-btn" onClick=${closeScreen} aria-label="Cerrar"><${Icon} name="x" size=${20} /></button><b>Nuevo entreno</b><span></span></div>
    <div class="screen-body">
      <h1 class="big-q">¿Qué toca hoy?</h1>
      <div class="stack">
        ${doc.routines.map((r) => html`<button class="start-card" onClick=${() => onStart(r.exercises)}>
          <div><b>${r.name}</b><small>${r.exercises.join(' · ')}</small></div><${Icon} name="right" size=${18} />
        </button>`)}
        ${last && html`<button class="start-card" onClick=${() => onStart(last.exercises.map((e) => e.name))}>
          <div><b>Repetir el último</b><small>${fmtShort(last.date)} · ${last.exercises.map((e) => e.name).join(' · ')}</small></div><${Icon} name="repeat" size=${18} />
        </button>`}
        <button class="start-card accent" onClick=${() => onStart([])}><div><b>Entreno libre</b><small>Agrega los ejercicios sobre la marcha</small></div><${Icon} name="plus" size=${18} /></button>
      </div>
      ${doc.routines.length === 0 && html`<p class="muted small center">Tip: al terminar un entreno puedes guardarlo como rutina y empezarlo con un toque.</p>`}
    </div>
  </div>`;
}

function ExerciseCard({ ex, doc, edit, toggle }) {
  const sug = useMemo(() => L.suggestNext(doc, ex.name), [ex.name, doc.sessions.length]);
  const prev = sug?.last.sets || [];
  const upd = (setId, field) => (v) => edit((d) => { d.exercises.find((e) => e.id === ex.id).sets.find((s) => s.id === setId)[field] = v; });
  return html`<section class="ex-card">
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
      <button class="link" onClick=${() => edit((d) => { const e = d.exercises.find((x) => x.id === ex.id); const l = e.sets.at(-1) || { kg: '', reps: '' }; e.sets.push({ id: uid(), kg: l.kg, reps: l.reps, done: false }); })}>+ Serie</button>
      ${ex.sets.length > 1 && html`<button class="link muted" onClick=${() => edit((d) => { d.exercises.find((x) => x.id === ex.id).sets.pop(); })}>− Quitar última</button>`}
    </footer>
  </section>`;
}

function ExercisePicker({ doc, added, onAdd, onClose }) {
  const [q, setQ] = useState('');
  const cat = L.exerciseCatalog(doc);
  const known = new Set(cat.map((c) => c.key));
  const term = L.keyOf(q);
  const match = (n) => !term || L.keyOf(n).includes(term);
  const recents = cat.filter((c) => match(c.name));
  const lib = L.LIBRARY.map(([g, names]) => [g, names.filter((n) => !known.has(L.keyOf(n)) && match(n))]).filter(([, n]) => n.length);
  const exact = cat.some((c) => c.key === term) || L.LIBRARY.some(([, n]) => n.some((x) => L.keyOf(x) === term));
  const Row = ({ name, sub }) => {
    const on = added.includes(L.keyOf(name));
    return html`<button class=${cx('pick-row', on && 'on')} onClick=${() => { if (!on) { onAdd(name); toast(`${name} agregado`, { icon: '✓' }); } }}><span>${name}${sub && html`<small>${sub}</small>`}</span>${on ? html`<${Icon} name="check" size=${18} sw=${3} />` : html`<${Icon} name="plus" size=${18} />`}</button>`;
  };
  return html`<${Sheet} title="Agregar ejercicio" full onClose=${onClose}>
    <input class="search" placeholder="Buscar o escribir uno nuevo…" value=${q} onInput=${(e) => setQ(e.target.value)} enterkeyhint="search" />
    ${term && !exact && html`<button class="pick-row new" onClick=${() => { onAdd(q.trim()); setQ(''); toast(`${q.trim()} agregado`, { icon: '✓' }); }}><span>Crear “${q.trim()}”</span><${Icon} name="plus" size=${18} /></button>`}
    ${recents.length > 0 && html`<h3 class="grp">Tus ejercicios</h3>${recents.map((c) => html`<${Row} name=${c.name} sub=${`Último: ${fmtShort(c.last)}`} />`)}`}
    ${lib.map(([g, names]) => html`<h3 class="grp">${g}</h3>${names.map((n) => html`<${Row} name=${n} />`)}`)}
    <button class="btn primary block" onClick=${onClose}>Listo</button>
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
    ${prs.length > 0 && html`<div class="pr-banner">🏆 ¡Récord en ${prs.join(', ')}! +${L.EARN.pr * prs.length} 🪙</div>`}
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
