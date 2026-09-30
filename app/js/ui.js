import * as S from './store.js';
import { ring, lineChart, barChart } from './charts.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kg = (v) => `${Math.round(v * 100) / 100} kg`;
const fmtDate = (s) => S.parseYmd(s).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDate = (s) => S.parseYmd(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

const ui = { tab: 'home', sheet: null, draft: null, exKey: null };

const TABS = [
  ['home', '🏠', 'Inicio'],
  ['train', '🏋️', 'Entrenar'],
  ['water', '💧', 'Agua'],
  ['rewards', '🪙', 'Premios'],
  ['me', '👤', 'Perfil'],
];

// ====================== render ======================
export function render() {
  const p = S.current();
  const y = window.scrollY;
  if (!p) {
    $('#app').innerHTML = onboarding();
    $('#tabbar').hidden = true;
    $('#sheet').innerHTML = '';
    return;
  }
  $('#tabbar').hidden = false;
  $('#tabbar').innerHTML = TABS.map(
    ([id, icon, label]) => `<button data-action="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}" aria-label="${label}"><span>${icon}</span>${label}</button>`
  ).join('');
  $('#app').innerHTML = `${header(p)}<main class="view">${views[ui.tab](p)}</main>`;
  renderSheet(p);
  window.scrollTo(0, y);
}

function header(p) {
  const hour = new Date().getHours();
  const hi = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return `<header class="top">
    <div><small class="muted">${hi}</small><h1>${esc(p.name)} ${esc(p.emoji)}</h1></div>
    <div class="top-r">
      <span class="pill gold" data-action="tab" data-tab="rewards">🪙 ${S.balance(p)}</span>
      <button class="avatar" style="--c:${p.color}" data-action="sheet" data-sheet="profiles" aria-label="Cambiar de perfil">${esc(p.emoji)}</button>
    </div>
  </header>`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.id);
  toast.id = setTimeout(() => t.classList.remove('show'), 2600);
}

/** Corre una acción y avisa si ganaste o perdiste tokens. */
function withTokens(p, fn, okMsg) {
  const before = S.balance(p);
  const res = fn();
  const diff = S.balance(p) - before;
  if (res === false) return;
  if (diff > 0) toast(`+${diff} 🪙 ${okMsg || '¡Bien hecho!'}`);
}

// ====================== onboarding ======================
function profileFields(v = {}) {
  return `
    <label>Nombre<input name="name" required maxlength="20" value="${esc(v.name || '')}" placeholder="Tu nombre" autocomplete="off"></label>
    <div class="emojis">${S.EMOJIS.map((e, i) => `<label><input type="radio" name="emoji" value="${e}" ${(v.emoji || S.EMOJIS[0]) === e ? 'checked' : ''}><span>${e}</span></label>`).join('')}</div>
    <div class="row2">
      <label>Estatura (cm)<input name="heightCm" type="number" inputmode="decimal" step="0.1" value="${v.heightCm ?? ''}" placeholder="170"></label>
      ${v.weightKg === undefined ? '' : `<label>Peso hoy (kg)<input name="weightKg" type="number" inputmode="decimal" step="0.1" placeholder="70"></label>`}
    </div>
    <label>Días de gym por semana (meta)<input name="weeklyGoal" type="number" inputmode="numeric" min="1" max="7" value="${v.weeklyGoal ?? 3}"></label>`;
}

function onboarding() {
  return `<div class="onboard">
    <div class="logo">🏋️</div>
    <h1>Bienvenidos al gym</h1>
    <p class="muted">Empieza creando tu perfil. Después agregamos el de tu pareja desde <b>Perfil</b>.</p>
    <form class="card stack" data-form="new-profile">${profileFields({ weightKg: '' })}<button class="btn primary">Empezar</button></form>
  </div>`;
}

// ====================== vistas ======================
const views = { home, train, water, rewards, me };

function home(p) {
  const counts = S.weekCounts(p);
  const thisWeek = counts[S.mondayOf(S.ymd())] || 0;
  const streak = S.weekStreak(p);
  const goals = S.exerciseCatalog(p).slice(0, 4);
  const h = S.habits(p);
  const wt = S.waterToday(p);
  const weights = p.weights.map((w) => ({ label: shortDate(w.date), y: w.kg }));
  const bmi = S.bmi(p);

  return `
  <section class="card">
    <div class="split">
      ${ring({ value: thisWeek, max: p.weeklyGoal, label: `${thisWeek}/${p.weeklyGoal}`, sub: 'esta semana', size: 116 })}
      <div class="grow">
        <div class="dots">${S.weekDots(p).map((d) => `<span class="${d.done ? 'done' : ''} ${d.today ? 'today' : ''}">${d.label[0]}</span>`).join('')}</div>
        <p class="big-note">${streak ? `🔥 ${streak} ${streak === 1 ? 'semana' : 'semanas'} cumpliendo tu meta` : 'Cumple tu meta semanal para empezar una racha'}</p>
        <button class="btn primary sm" data-action="sheet" data-sheet="workout">+ Registrar entreno</button>
      </div>
    </div>
  </section>

  <div class="grid2">
    <section class="card mini" data-action="tab" data-tab="water">
      <small class="muted">Agua hoy</small>
      <b class="stat" style="color:var(--water)">${(wt / 1000).toFixed(2)} L</b>
      <div class="meter"><i style="width:${Math.min(100, (wt / p.waterGoalMl) * 100)}%"></i></div>
      <small class="muted">meta ${p.waterGoalMl / 1000} L</small>
    </section>
    <section class="card mini" data-action="tab" data-tab="rewards">
      <small class="muted">Tokens</small>
      <b class="stat" style="color:var(--gold)">🪙 ${S.balance(p)}</b>
      <small class="muted">${nextRewardText(p)}</small>
    </section>
  </div>

  <section class="card">
    <h2>Metas para tu próximo entreno</h2>
    ${goals.length ? goals.map((g) => goalRow(p, g)).join('') : '<p class="muted">Registra tu primer entreno y aquí te digo cuánto subirle la próxima vez.</p>'}
  </section>

  <section class="card">
    <h2>Cuándo entrenas</h2>
    ${h.total
      ? `${barChart(h.perDay.map((v, i) => ({ label: S.DAY_NAMES[i][0], value: v, hot: h.topDays.includes(S.DAY_NAMES[i]) })))}
         <p class="muted small">${h.total} días registrados · Vas más los <b>${h.topDays.join(' y ')}</b>${h.avgTime ? ` · Hora típica: <b>${h.avgTime}</b>` : ''}</p>`
      : '<p class="muted">Aún no hay entrenos registrados.</p>'}
    <p class="muted small">Este mes: <b>${S.monthCount(p)}</b> días de gym</p>
  </section>

  <section class="card">
    <div class="row-between"><h2>Peso corporal</h2><button class="btn ghost sm" data-action="sheet" data-sheet="weight">+ Peso</button></div>
    ${p.weights.length ? `<p class="stat sm">${kg(p.weights.at(-1).kg)} ${bmi ? `<small class="muted">· IMC ${bmi.toFixed(1)}</small>` : ''}</p>` : ''}
    ${lineChart(weights, { unit: '', color: 'var(--accent2)' })}
  </section>`;
}

function nextRewardText(p) {
  const bal = S.balance(p);
  const next = [...S.get().rewards].sort((a, b) => a.cost - b.cost).find((r) => r.cost > bal);
  return next ? `Faltan ${next.cost - bal} para ${next.emoji}` : 'Ya alcanzas todo 🎉';
}

function goalRow(p, g) {
  const s = S.suggestNext(p, g.name);
  if (!s) return '';
  const lastTxt = s.last.sets.map((x) => `${x.reps}×${x.kg ? kg(x.kg) : 'PC'}`).join(' · ');
  return `<div class="goal-row">
    <div class="grow"><b>${esc(g.name)}</b><small class="muted">Última vez (${shortDate(s.last.date)}): ${lastTxt}</small></div>
    <div class="target ${s.up ? 'up' : ''}">${s.sets}×${s.reps}<small>${s.kg ? kg(s.kg) : 'peso corporal'}</small>${s.up ? '<em>⬆ sube peso</em>' : ''}</div>
  </div>`;
}

function train(p) {
  const cat = S.exerciseCatalog(p);
  if (!ui.exKey || !cat.find((c) => c.key === ui.exKey)) ui.exKey = cat[0]?.key || null;
  const sel = cat.find((c) => c.key === ui.exKey);
  const series = sel ? S.exerciseSeries(p, sel.key) : [];
  const sessions = [...p.sessions].reverse();

  return `
  <button class="btn primary block" data-action="sheet" data-sheet="workout">+ Nuevo entrenamiento</button>

  <section class="card">
    <h2>Progreso por ejercicio</h2>
    ${cat.length
      ? `<div class="chips">${cat.map((c) => `<button class="chip ${c.key === ui.exKey ? 'on' : ''}" data-action="pick-ex" data-key="${esc(c.key)}">${esc(c.name)}</button>`).join('')}</div>
         ${lineChart(series.map((x) => ({ label: shortDate(x.date), y: x.top || x.reps })), { unit: series.at(-1)?.top ? 'kg' : '' })}
         <div class="sep"></div>${goalRow(p, sel) || ''}`
      : '<p class="muted">Aquí verás la gráfica de cada ejercicio.</p>'}
  </section>

  <section class="card">
    <h2>Historial</h2>
    ${sessions.length ? sessions.map(sessionCard).join('') : '<p class="muted">Sin entrenos todavía.</p>'}
  </section>`;
}

function sessionCard(s) {
  return `<article class="session">
    <div class="row-between"><b>${fmtDate(s.date)}</b><span class="muted small">${esc(s.time)}</span></div>
    ${s.exercises.map((ex) => `<div class="ex-line"><span>${esc(ex.name)}</span><small class="muted">${ex.sets.map((x) => `${x.reps}×${x.kg ? x.kg : 'PC'}`).join(' · ')}</small></div>`).join('')}
    ${s.note ? `<p class="muted small">📝 ${esc(s.note)}</p>` : ''}
    <button class="link danger" data-action="del-session" data-id="${s.id}">Eliminar</button>
  </article>`;
}

function water(p) {
  const ml = S.waterToday(p);
  const done = ml >= p.waterGoalMl;
  const days = S.lastDaysWater(p);
  return `
  <section class="card center">
    ${ring({ value: ml, max: p.waterGoalMl, size: 210, stroke: 16, color: 'var(--water)', label: `${(ml / 1000).toFixed(2)} L`, sub: `de ${p.waterGoalMl / 1000} L` })}
    <p class="big-note">${done ? `¡Meta cumplida! +${S.EARN.water} 🪙 ganados hoy 💧` : `Te faltan ${((p.waterGoalMl - ml) / 1000).toFixed(2)} L · ganas +${S.EARN.water} 🪙 al llegar`}</p>
    <div class="quick">
      ${[150, 250, 500, 750].map((v) => `<button class="btn" data-action="water" data-ml="${v}">+${v} ml</button>`).join('')}
    </div>
    <form class="inline" data-form="water-custom">
      <input name="ml" type="number" inputmode="numeric" min="1" placeholder="Otra cantidad (ml)">
      <button class="btn">Agregar</button>
    </form>
    <button class="link" data-action="water" data-ml="-250">Deshacer −250 ml</button>
  </section>
  <section class="card">
    <h2>Últimos 7 días</h2>
    ${barChart(days.map((d) => ({ label: S.parseYmd(d.date).toLocaleDateString('es-MX', { weekday: 'narrow' }), value: d.ml, hot: d.ml >= p.waterGoalMl })), { max: Math.max(p.waterGoalMl * 1.2, ...days.map((d) => d.ml)), goal: p.waterGoalMl })}
    <p class="muted small">La línea marca tu meta. Las barras verdes son días cumplidos.</p>
  </section>`;
}

function rewards(p) {
  const bal = S.balance(p);
  const list = [...S.get().rewards].sort((a, b) => a.cost - b.cost);
  return `
  <section class="card center gold-card">
    <small class="muted">Tu saldo</small>
    <b class="stat huge">🪙 ${bal}</b>
  </section>

  <section class="card">
    <h2>Canjear premios</h2>
    ${list.map((r) => `<div class="reward">
      <span class="emoji">${esc(r.emoji)}</span>
      <div class="grow"><b>${esc(r.name)}</b><small class="muted">🪙 ${r.cost}</small></div>
      <button class="btn sm ${bal >= r.cost ? 'primary' : ''}" ${bal >= r.cost ? '' : 'disabled'} data-action="redeem" data-id="${r.id}">Canjear</button>
      <button class="link danger" data-action="del-reward" data-id="${r.id}" aria-label="Eliminar">✕</button>
    </div>`).join('') || '<p class="muted">No hay premios. Agrega el primero abajo.</p>'}
    <form class="stack" data-form="reward">
      <div class="row3"><input name="emoji" maxlength="2" placeholder="🎁" aria-label="Emoji"><input name="name" placeholder="Nuevo premio" required><input name="cost" type="number" inputmode="numeric" min="1" placeholder="🪙" required></div>
      <button class="btn">Agregar premio</button>
    </form>
  </section>

  <section class="card">
    <h2>Cómo ganar tokens</h2>
    <ul class="earn">
      <li><span>🏋️ Ir al gimnasio (por día)</span><b>+${S.EARN.gym}</b></li>
      <li><span>💧 Tomar tu meta de agua</span><b>+${S.EARN.water}</b></li>
      <li><span>🏆 Récord personal en un ejercicio</span><b>+${S.EARN.pr}</b></li>
      <li><span>🔥 Cumplir tu meta semanal</span><b>+${S.EARN.week}</b></li>
    </ul>
  </section>

  <section class="card">
    <h2>Movimientos</h2>
    ${S.ledgerSorted(p).slice(0, 25).map((e) => `<div class="ledger"><div class="grow"><b>${esc(e.reason)}</b><small class="muted">${fmtDate(e.date)}</small></div><b class="${e.delta > 0 ? 'pos' : 'neg'}">${e.delta > 0 ? '+' : ''}${e.delta}</b></div>`).join('') || '<p class="muted">Todavía no hay movimientos.</p>'}
  </section>`;
}

function me(p) {
  const st = S.get();
  return `
  <section class="card">
    <h2>Mis datos</h2>
    <form class="stack" data-form="edit-profile">
      ${profileFields(p)}
      <label>Meta de agua (ml al día)<input name="waterGoalMl" type="number" inputmode="numeric" min="500" step="250" value="${p.waterGoalMl}"></label>
      <button class="btn primary">Guardar</button>
    </form>
  </section>

  <section class="card">
    <h2>Perfiles en este teléfono</h2>
    ${st.profiles.map((x) => `<div class="reward"><span class="avatar sm" style="--c:${x.color}">${esc(x.emoji)}</span><div class="grow"><b>${esc(x.name)}</b><small class="muted">🪙 ${S.balance(x)} · ${x.sessions.length} entrenos</small></div>${x.id === p.id ? '<span class="pill">activo</span>' : `<button class="btn sm" data-action="switch" data-id="${x.id}">Cambiar</button>`}</div>`).join('')}
    <button class="btn block" data-action="sheet" data-sheet="new-profile">+ Agregar perfil</button>
  </section>

  <section class="card">
    <h2>💌 Mensajes motivacionales</h2>
    <p class="muted">Próximamente (Fase 2): un espacio privado solo para ustedes dos para mandarse mensajes y ver el progreso del otro.</p>
  </section>

  <section class="card">
    <h2>Respaldo</h2>
    <p class="muted small">Por ahora tus datos viven solo en este teléfono. Descarga un respaldo de vez en cuando.</p>
    <div class="row2"><button class="btn" data-action="export">Descargar</button><label class="btn file">Restaurar<input type="file" accept="application/json" data-action-change="import" hidden></label></div>
  </section>`;
}

// ====================== sheets ======================
function renderSheet(p) {
  const el = $('#sheet');
  const scroll = el.querySelector('.sheet')?.scrollTop || 0;
  if (!ui.sheet) { el.innerHTML = ''; document.body.classList.remove('locked'); return; }
  document.body.classList.add('locked');
  const bodies = {
    workout: () => workoutSheet(p),
    weight: () => `<h2>Registrar peso</h2><form class="stack" data-form="weight">
      <div class="row2"><label>Peso (kg)<input name="kg" type="number" inputmode="decimal" step="0.1" required autofocus></label><label>Fecha<input name="date" type="date" value="${S.ymd()}"></label></div>
      <button class="btn primary">Guardar</button></form>`,
    profiles: () => `<h2>¿Quién eres?</h2>${S.get().profiles.map((x) => `<button class="reward btn-row" data-action="switch" data-id="${x.id}"><span class="avatar sm" style="--c:${x.color}">${esc(x.emoji)}</span><div class="grow"><b>${esc(x.name)}</b><small class="muted">🪙 ${S.balance(x)}</small></div>${x.id === p.id ? '✓' : ''}</button>`).join('')}
      <button class="btn block" data-action="sheet" data-sheet="new-profile">+ Agregar perfil</button>`,
    'new-profile': () => `<h2>Nuevo perfil</h2><form class="stack" data-form="new-profile">${profileFields({ weightKg: '' })}<button class="btn primary">Crear</button></form>`,
  };
  el.innerHTML = `<div class="backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog"><div class="grab"></div>${bodies[ui.sheet]()}</div>`;
  el.querySelector('.sheet').scrollTop = scroll;
}

function newDraft() {
  return { date: S.ymd(), time: S.hm(), note: '', exercises: [] };
}

function workoutSheet(p) {
  const d = ui.draft;
  const known = S.exerciseCatalog(p);
  return `<h2>Nuevo entrenamiento</h2>
  <div class="row2">
    <label>Fecha<input type="date" data-draft="date" value="${d.date}"></label>
    <label>Hora<input type="time" data-draft="time" value="${d.time}"></label>
  </div>
  ${d.exercises.map((ex, i) => {
    const s = S.suggestNext(p, ex.name);
    return `<div class="ex-card">
      <div class="row-between"><b>${esc(ex.name)}</b><button class="link danger" data-action="rm-ex" data-i="${i}">Quitar</button></div>
      ${s ? `<p class="hint">🎯 Meta: ${s.sets}×${s.reps} con ${s.kg ? kg(s.kg) : 'peso corporal'}${s.up ? ' (¡sube peso!)' : ''}</p>` : '<p class="hint">Primera vez con este ejercicio: anota lo que hagas y la próxima te doy la meta.</p>'}
      <div class="set-head"><span></span><span>Kg</span><span>Reps</span><span></span></div>
      ${ex.sets.map((st, j) => `<div class="set"><span>${j + 1}</span>
        <input type="number" inputmode="decimal" step="0.5" data-i="${i}" data-j="${j}" data-f="kg" value="${st.kg}" placeholder="0">
        <input type="number" inputmode="numeric" data-i="${i}" data-j="${j}" data-f="reps" value="${st.reps}" placeholder="0">
        <button class="link danger" data-action="rm-set" data-i="${i}" data-j="${j}" aria-label="Quitar serie">✕</button></div>`).join('')}
      <button class="btn ghost sm" data-action="add-set" data-i="${i}">+ Serie</button>
    </div>`;
  }).join('')}
  <form class="inline" data-form="add-ex">
    <input name="name" list="ex-list" placeholder="Agregar ejercicio (ej. Press banca)" required autocomplete="off">
    <datalist id="ex-list">${known.map((k) => `<option value="${esc(k.name)}">`).join('')}</datalist>
    <button class="btn">Agregar</button>
  </form>
  <label>Nota (opcional)<input data-draft="note" value="${esc(d.note)}" placeholder="Cómo te sentiste…"></label>
  <button class="btn primary block" data-action="save-workout">Guardar entrenamiento</button>`;
}

// ====================== eventos ======================
const actions = {
  tab: (el) => { ui.tab = el.dataset.tab; ui.sheet = null; window.scrollTo(0, 0); render(); },
  sheet: (el) => {
    ui.sheet = el.dataset.sheet;
    if (ui.sheet === 'workout') ui.draft = ui.draft || newDraft();
    render();
  },
  'close-sheet': () => { ui.sheet = null; render(); },
  'pick-ex': (el) => { ui.exKey = el.dataset.key; render(); },
  switch: (el) => { ui.sheet = null; S.setActive(el.dataset.id); },
  water: (el) => {
    const p = S.current();
    withTokens(p, () => S.addWater(p, Number(el.dataset.ml)), '¡Meta de agua cumplida!');
  },
  redeem: (el) => {
    const p = S.current();
    const r = S.get().rewards.find((x) => x.id === el.dataset.id);
    if (r && confirm(`¿Canjear "${r.name}" por ${r.cost} tokens?`)) {
      if (S.redeem(p, r.id)) toast(`${r.emoji} ¡Disfruta tu premio!`);
    }
  },
  'del-reward': (el) => { if (confirm('¿Eliminar este premio?')) S.removeReward(el.dataset.id); },
  'del-session': (el) => { if (confirm('¿Eliminar este entrenamiento? Se revertirán sus tokens.')) S.deleteSession(S.current(), el.dataset.id); },
  'rm-ex': (el) => { ui.draft.exercises.splice(Number(el.dataset.i), 1); render(); },
  'add-set': (el) => {
    const ex = ui.draft.exercises[Number(el.dataset.i)];
    const last = ex.sets.at(-1) || { kg: '', reps: '' };
    ex.sets.push({ kg: last.kg, reps: last.reps });
    render();
  },
  'rm-set': (el) => { ui.draft.exercises[Number(el.dataset.i)].sets.splice(Number(el.dataset.j), 1); render(); },
  'save-workout': () => {
    const p = S.current();
    const draft = ui.draft;
    ui.draft = null;
    ui.sheet = null; // se cierra antes de guardar: guardar dispara el render
    withTokens(p, () => {
      if (S.addSession(p, draft)) return;
      ui.draft = draft;
      ui.sheet = 'workout';
      render();
      toast('Agrega al menos un ejercicio con una serie');
      return false;
    }, '¡Buen entreno!');
  },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: 'application/json' }));
    a.download = `gym-respaldo-${S.ymd()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

const forms = {
  'new-profile': (f) => {
    ui.sheet = null;
    ui.tab = 'home';
    S.addProfile(f);
  },
  'edit-profile': (f) => { S.updateProfile(S.current().id, f); toast('Guardado ✓'); },
  weight: (f) => { ui.sheet = null; S.logWeight(S.current(), f.kg, f.date); },
  'water-custom': (f) => {
    const p = S.current();
    if (Number(f.ml) > 0) withTokens(p, () => S.addWater(p, Number(f.ml)), '¡Meta de agua cumplida!');
  },
  reward: (f) => S.addReward(f),
  'add-ex': (f) => {
    const p = S.current();
    const s = S.suggestNext(p, f.name);
    const n = s ? s.sets : 3;
    ui.draft.exercises.push({
      name: f.name.trim(),
      sets: Array.from({ length: n }, () => ({ kg: s ? s.kg : '', reps: s ? s.reps : '' })),
    });
    render();
  },
};

export function bind() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action] && !el.disabled) actions[el.dataset.action](el);
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    forms[form.dataset.form](Object.fromEntries(new FormData(form)));
  });

  // Inputs del entreno: se guardan en el borrador sin re-renderizar (no perder el foco).
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!ui.draft) return;
    if (t.dataset.draft) ui.draft[t.dataset.draft] = t.value;
    else if (t.dataset.f) ui.draft.exercises[Number(t.dataset.i)].sets[Number(t.dataset.j)][t.dataset.f] = t.value;
  });

  document.addEventListener('change', async (e) => {
    if (e.target.dataset.actionChange !== 'import') return;
    const file = e.target.files[0];
    if (!file) return;
    try {
      S.importJSON(await file.text());
      toast('Respaldo restaurado ✓');
    } catch {
      toast('Ese archivo no es un respaldo válido');
    }
  });
}
