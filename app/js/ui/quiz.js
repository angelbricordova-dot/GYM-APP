import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { CATEGORIES } from '../questions.js';
import { Icon, Sheet, toast, cx, fmtDay } from './kit.js';
import { haptic } from '../theme.js';

// ---------- estado compartido: la pregunta de hoy (Hoy y Juntos usan la misma) ----------
const quiz = { data: null, date: null, error: null };
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());
let inflight = null;

export async function loadQuiz() {
  const date = L.ymd();
  if (inflight) return inflight;
  inflight = S.request('GET', `/quiz/today?date=${date}`).then((r) => {
    inflight = null;
    if (r.ok) { quiz.data = r.data; quiz.date = date; quiz.error = null; } else if (r.status !== 0) { quiz.data = null; quiz.error = r.data.error; }
    emit();
  });
  return inflight;
}
/** La pregunta de hoy (se actualiza sola cada 30 s mientras haya un componente que la muestre). */
export function useQuiz(on = true) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const f = () => tick((v) => v + 1);
    listeners.add(f);
    if (quiz.date !== L.ymd()) { quiz.data = null; }
    loadQuiz();
    const id = setInterval(loadQuiz, 30000);
    return () => { listeners.delete(f); clearInterval(id); };
  }, [on]);
  return quiz;
}
/** ¿Hay una pregunta esperando mi respuesta? (para los puntitos rojos) */
export const quizPending = () => !!quiz.data && quiz.date === L.ymd() && !quiz.data.me.answered;

async function answer(payload) {
  const r = await S.request('POST', '/quiz/answer', { date: L.ymd(), ...payload });
  if (r.ok) { quiz.data = r.data; quiz.date = L.ymd(); emit(); } else toast(r.data.error || 'No se pudo enviar', { icon: '⚠️' });
  return r.ok;
}

// ---------- la pregunta (responder y ver las dos respuestas) ----------
function Answer({ d }) {
  const q = d.q;
  const [text, setText] = useState('');
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const value = q.type === 'open' ? text.trim() : pick;
  const ok = q.type === 'open' ? !!value : value !== null;
  const send = async () => { setBusy(true); haptic(); await answer({ value }); setBusy(false); };
  const skip = async () => { setBusy(true); await answer({ skip: true }); setBusy(false); };
  return html`<div class="quiz-answer">
    ${q.type === 'open' && html`<textarea class="quiz-text" maxlength="400" rows="4" placeholder="Escribe con confianza…" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>`}
    ${q.type === 'choice' && html`<div class="quiz-opts">${q.options.map((o, i) => html`<button type="button" class=${cx('quiz-opt', pick === i && 'on')} onClick=${() => setPick(i)}>${o}</button>`)}</div>`}
    ${q.type === 'scale' && html`<div class="quiz-scale"><div class="qs-row">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" class=${cx('qs', pick === n && 'on')} onClick=${() => setPick(n)}>${n}</button>`)}</div><div class="qs-lbl"><small class="muted">${q.low}</small><small class="muted">${q.high}</small></div></div>`}
    <button class="btn primary block lg" disabled=${!ok || busy} onClick=${send}>${busy ? 'Enviando…' : 'Enviar mi respuesta'}</button>
    <button class="link muted quiz-skip" disabled=${busy} onClick=${skip}>Prefiero no responder esta</button>
    <p class="muted small center">${d.partner.name} no verá tu respuesta hasta que también responda, y tú verás la suya cuando envíes la tuya. 🔒</p>
  </div>`;
}

function Answers({ d }) {
  const mine = d.me, theirs = d.partner;
  const same = d.q.type === 'choice' && mine.answered && theirs.answered && !mine.skipped && !theirs.skipped && mine.value === theirs.value;
  const bubble = (who, a, you) => html`<div class=${cx('qa-bubble', you && 'you')}>
    <small class="muted">${who}</small>
    ${!a.answered ? html`<b class="muted">🙈 Todavía no responde…</b>` : a.skipped ? html`<b class="muted">Prefirió no responder</b>` : html`<b>${a.text}</b>`}
  </div>`;
  return html`<div class="quiz-answers">
    ${bubble('Tú', mine, true)}
    ${bubble(theirs.name, theirs, false)}
    ${same && html`<p class="quiz-match">¡Coincidieron! 💞</p>`}
    ${!theirs.answered && html`<p class="muted small center">Cuando ${theirs.name} responda, su respuesta aparece aquí.</p>`}
  </div>`;
}

const Chip = ({ cat }) => html`<span class=${cx('quiz-chip', cat)}>${CATEGORIES[cat]?.emoji} ${CATEGORIES[cat]?.label}</span>`;

export function QuizBody({ d }) {
  return html`<div class="quiz-body">
    <${Chip} cat=${d.q.cat} />
    <h3 class="quiz-q">${d.q.text}</h3>
    ${d.me.answered ? html`<${Answers} d=${d} />` : html`<${Answer} d=${d} />`}
  </div>`;
}

// ---------- tarjeta de Hoy ----------
export function QuizCard() {
  const partner = S.state.partner;
  const { data: d } = useQuiz(!!partner);
  const [open, setOpen] = useState(false);
  if (!partner || !d) return null;
  const both = d.me.answered && d.partner.answered;
  const status = !d.me.answered ? (d.partner.answered ? `${d.partner.name} ya respondió 👀` : 'Responde y descubre qué contesta') : both ? 'Los dos ya respondieron' : `Esperando a ${d.partner.name}…`;
  return html`<section class=${cx('card quiz-card rise', !d.me.answered && 'attn')} style="--i:2">
    <div class="row-between"><span class="quiz-eyebrow">💞 Pregunta del día</span><${Chip} cat=${d.q.cat} /></div>
    <p class=${cx('quiz-q', d.me.answered && 'sm')}>${d.q.text}</p>
    <small class="muted">${status}</small>
    <button class=${cx('btn block', !d.me.answered || both ? 'primary' : 'tinted')} onClick=${() => setOpen(true)}>${!d.me.answered ? 'Responder' : both ? 'Ver respuestas 💞' : 'Ver mi respuesta'}</button>
    ${open && html`<${Sheet} title="Pregunta del día" onClose=${() => setOpen(false)}><${QuizBody} d=${d} /><//>`}
  </section>`;
}

// ---------- Juntos → Quiz ----------
export function QuizPanel() {
  const partner = S.state.partner;
  const { data: d, error } = useQuiz(true);
  const [hist, setHist] = useState(null);
  useEffect(() => { S.request('GET', '/quiz/history').then((r) => r.ok && setHist(r.data.items)); }, [d?.me?.answered, d?.partner?.answered]);
  const setSpicy = async (on) => {
    const r = await S.request('POST', '/quiz/settings', { spicy: on });
    if (r.ok) { toast(on ? 'Preguntas picantes activadas 🔥' : 'Sin preguntas picantes', { icon: on ? '🔥' : '🙂' }); loadQuiz(); }
  };
  const past = (hist || []).filter((h) => h.date !== L.ymd());
  return html`<div class="stack-lg">
    <section class="card rise">
      ${!partner ? html`<p class="muted">Las preguntas son en pareja: vincula a tu pareja primero.</p>`
        : error ? html`<p class="muted">${error}</p>`
        : !d ? html`<p class="muted">Cargando la pregunta de hoy…</p>`
        : html`<div class="row-between"><h2>Pregunta de hoy</h2><small class="muted">${fmtDay(d.date)}</small></div><${QuizBody} d=${d} />`}
    </section>
    ${partner && d && html`<section class="card rise" style="--i:1">
      <label class="row switch-row quiz-spicy"><div class="grow"><b>🔥 Incluir preguntas picantes</b><small class="muted">${d.spicy && !d.bothSpicy ? `${d.partner.name} las tiene apagadas, así que por ahora no salen.` : 'Sobre intimidad, deseos y fantasías. Siempre puedes elegir “Prefiero no responder”. Si alguno las apaga, no salen.'}</small></div><input type="checkbox" checked=${d.spicy} onChange=${(e) => setSpicy(e.target.checked)} /></label>
    </section>`}
    ${past.length > 0 && html`<section class="card rise" style="--i:2"><h2>Respuestas anteriores</h2>
      ${past.slice(0, 20).map((h) => html`<div class="quiz-hist"><div class="row-between"><${Chip} cat=${h.q.cat} /><small class="muted">${fmtDay(h.date)}</small></div><b>${h.q.text}</b>
        <div class="qh-ans"><small class="muted">Tú</small><span>${h.me.skipped ? 'No respondiste' : h.me.text}</span></div>
        <div class="qh-ans"><small class="muted">${h.partner.name}</small><span>${!h.partner.answered ? '🙈 No respondió' : h.partner.skipped ? 'Prefirió no responder' : h.partner.text}</span></div></div>`)}
    </section>`}
  </div>`;
}
