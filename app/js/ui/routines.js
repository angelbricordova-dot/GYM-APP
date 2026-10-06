import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Sheet, Field, Empty, toast, cx, fmtDay } from './kit.js';
import { beginWorkout } from './workout.js';

const nameOf = (id) => (id === S.state.auth.uid ? 'Tú' : S.state.partner?.name || 'Tu pareja');
const STATUS = { new: 'Nueva', seen: 'Vista', saved: 'Guardada', dismissed: 'Descartada' };

/** Una sesión pasada → ejercicios de rutina con sus series y repeticiones típicas (los kilos son personales y no se comparten). */
const fromSession = (s) => s.exercises.map((e) => ({ name: e.name, sets: e.sets.length, reps: Math.round(e.sets.reduce((a, x) => a + x.reps, 0) / e.sets.length) }));
const fromRoutine = (r) => L.routineItems(r).map((e) => ({ name: e.name, sets: e.sets || 3, reps: e.reps || 10 }));
const summary = (e) => `${e.sets || 3}×${e.reps || 10}`;

// ============ tarjeta de una rutina recomendada ============
export function SharedRoutineCard({ r }) {
  const mine = r.from === S.state.auth.uid;
  const [open, setOpen] = useState(!mine && r.status === 'new');
  const items = L.routineItems(r);

  const start = () => { if (r.status === 'new') S.routineAction(r.id, 'seen'); beginWorkout(items); };
  const save = async () => { const res = await S.saveSharedRoutine(r); toast(res.ok ? 'Guardada en tus rutinas' : res.data.error, { icon: res.ok ? '📌' : '⚠️' }); };
  const dismiss = async () => { if (confirm('¿Descartar esta recomendación?')) S.routineAction(r.id, 'dismiss'); };
  const remove = async () => { if (confirm('¿Quitar esta rutina compartida?')) S.routineAction(r.id, 'delete'); };

  return html`<article class=${cx('shared-routine', r.status === 'new' && !mine && 'attn')}>
    <button class="sr-head" onClick=${() => { setOpen(!open); if (!mine && r.status === 'new') S.routineAction(r.id, 'seen'); }} aria-expanded=${open}>
      <span class="sr-ic"><${Icon} name="dumbbell" size=${20} /></span>
      <span class="grow"><b>${r.name}</b><small class="muted">${mine ? `Compartida con ${nameOf(r.to)}` : `Recomendada por ${nameOf(r.from)}`} · ${items.length} ejercicios</small></span>
      <span class=${cx('chip tiny', r.status === 'new' && 'on')}>${mine && r.status === 'new' ? 'Enviada' : STATUS[r.status]}</span>
      <${Icon} name=${open ? 'chevD' : 'right'} size=${16} class="chev" />
    </button>
    ${open && html`<div class="sr-body">
      ${r.note && html`<p class="sr-note">“${r.note}”</p>`}
      <ol class="sr-list">${items.map((e) => html`<li><span>${e.name}</span><small class="muted">${summary(e)}</small></li>`)}</ol>
      <small class="muted">${fmtDay(L.ymd(new Date(r.ts)))}</small>
      ${!mine && html`<div class="sr-actions">
        <button class="btn primary grow" onClick=${start}><${Icon} name="play" size=${16} fill /> Empezar ahora</button>
        <button class="btn tinted" onClick=${save} disabled=${r.status === 'saved'}>${r.status === 'saved' ? 'Guardada ✓' : 'Guardar'}</button>
      </div>
      <button class="link danger" onClick=${dismiss}>Descartar</button>`}
      ${mine && html`<button class="link danger" onClick=${remove}>Quitar</button>`}
    </div>`}
  </article>`;
}

// ============ compartir una rutina ============
export function ShareRoutineSheet({ preset, onClose }) {
  const me = S.state.me;
  const partner = S.state.partner;
  const [step, setStep] = useState(preset ? 'edit' : 'pick');
  const [name, setName] = useState(preset?.name || '');
  const [note, setNote] = useState('');
  const [items, setItems] = useState(preset?.items || []);
  const [busy, setBusy] = useState(false);
  const recent = [...me.sessions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 3);

  const choose = (nm, its) => { setName(nm); setItems(its); setStep('edit'); };
  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await S.shareRoutine({ name, note, exercises: items });
    setBusy(false);
    if (r.ok) { toast(`Rutina enviada a ${partner?.name}`, { icon: '🏋️' }); onClose(); } else toast(r.data.error, { icon: '⚠️' });
  };

  if (step === 'pick') {
    return html`<${Sheet} title=${`Recomendar a ${partner?.name || 'tu pareja'}`} onClose=${onClose}>
      ${me.routines.length > 0 && html`<h3 class="sec-h">Tus rutinas</h3><div class="group">${me.routines.map((r) => html`<${PickRow} icon="list" title=${r.name} sub=${L.routineItems(r).map((e) => e.name).join(', ')} onClick=${() => choose(r.name, fromRoutine(r))} />`)}</div>`}
      ${recent.length > 0 && html`<h3 class="sec-h">Un entreno reciente</h3><div class="group">${recent.map((s) => html`<${PickRow} icon="history" title=${fmtDay(s.date)} sub=${s.exercises.map((e) => e.name).join(', ')} onClick=${() => choose(`Entreno del ${fmtDay(s.date)}`, fromSession(s))} />`)}</div>`}
      <h3 class="sec-h">Plantillas</h3>
      <div class="group">${L.TEMPLATES.map((t) => html`<${PickRow} icon="dumbbell" title=${t.name} sub=${t.sub} onClick=${() => choose(t.name, t.exercises.map((n) => ({ name: n, sets: 3, reps: 10 })))} />`)}</div>
      <p class="sec-f">Solo se comparten los ejercicios con sus series y repeticiones. Tus kilos no.</p>
    <//>`;
  }

  const upd = (i, patch) => setItems(items.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return html`<${Sheet} title="Revisa y envía" onClose=${onClose}>
    <form class="stack" onSubmit=${send}>
      <${Field} label="Nombre de la rutina"><input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="40" required placeholder="Ej. Pierna del lunes" /><//>
      <div class="group">${items.map((e, i) => html`<div class="row static">
        <div class="grow"><b>${e.name}</b></div>
        <div class="mini-step"><button type="button" onClick=${() => upd(i, { sets: Math.max(1, (e.sets || 3) - 1) })} aria-label="Menos series">−</button><b>${e.sets || 3}</b><small>series</small><button type="button" onClick=${() => upd(i, { sets: Math.min(10, (e.sets || 3) + 1) })} aria-label="Más series">+</button></div>
        <div class="mini-step"><button type="button" onClick=${() => upd(i, { reps: Math.max(1, (e.reps || 10) - 1) })} aria-label="Menos repeticiones">−</button><b>${e.reps || 10}</b><small>reps</small><button type="button" onClick=${() => upd(i, { reps: Math.min(50, (e.reps || 10) + 1) })} aria-label="Más repeticiones">+</button></div>
        <button type="button" class="icon-btn flat" onClick=${() => setItems(items.filter((_, j) => j !== i))} aria-label=${`Quitar ${e.name}`}><${Icon} name="x" size=${16} /></button>
      </div>`)}</div>
      <${Field} label="Nota para ${partner?.name || 'tu pareja'} (opcional)"><input value=${note} onInput=${(e) => setNote(e.target.value)} maxlength="200" placeholder="Ej. Esta me encanta, pruébala" /><//>
      <button class="btn primary block lg" disabled=${busy || !name.trim() || !items.length}>${busy ? 'Enviando…' : `Enviar a ${partner?.name || 'tu pareja'}`}</button>
      ${!preset && html`<button type="button" class="link" onClick=${() => setStep('pick')}>Elegir otra</button>`}
    </form>
  <//>`;
}

const PickRow = ({ icon, title, sub, onClick }) => html`<div class="row" role="button" tabIndex="0" onClick=${onClick} onKeyDown=${(e) => e.key === 'Enter' && onClick()}>
  <span class="lead"><${Icon} name=${icon} size=${18} /></span>
  <div class="grow"><b>${title}</b><small class="muted">${sub}</small></div>
  <${Icon} name="right" size=${16} class="chev" />
</div>`;

// ============ panel (pestaña Juntos → Rutinas) ============
export function RoutinesPanel() {
  const [sharing, setSharing] = useState(false);
  const me = S.state.auth.uid;
  const all = [...S.state.routines].sort((a, b) => b.ts - a.ts);
  const received = all.filter((r) => r.to === me && r.status !== 'dismissed');
  const sent = all.filter((r) => r.from === me);

  return html`<div class="stack-lg">
    ${S.state.partner
      ? html`<button class="btn primary block lg" onClick=${() => setSharing(true)}><${Icon} name="send" size=${18} /> Recomendar una rutina a ${S.state.partner.name}</button>`
      : html`<p class="notice">Cuando tu pareja se una podrán recomendarse rutinas.</p>`}
    ${received.length > 0 && html`<section><h3 class="sec-h">Recomendadas para ti</h3>${received.map((r) => html`<${SharedRoutineCard} key=${r.id} r=${r} />`)}</section>`}
    ${sent.length > 0 && html`<section><h3 class="sec-h">Las que compartiste</h3>${sent.map((r) => html`<${SharedRoutineCard} key=${r.id} r=${r} />`)}</section>`}
    ${received.length + sent.length === 0 && html`<${Empty} icon="🏋️" title="Aún no hay rutinas compartidas" text="Recomiéndense rutinas: la otra persona la ve aquí, la revisa y la empieza con un toque." />`}
    ${sharing && html`<${ShareRoutineSheet} onClose=${() => setSharing(false)} />`}
  </div>`;
}
