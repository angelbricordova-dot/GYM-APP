// Lógica pura (sin DOM): fechas, rachas, tokens, sobrecarga progresiva y estadísticas.
// Todo se calcula a partir del documento de cada persona, así borrar/editar algo nunca deja tokens huérfanos.

// ---------- fechas ----------
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const diffDays = (a, b) => Math.round((Date.UTC(...ymdParts(b)) - Date.UTC(...ymdParts(a))) / 864e5);
const ymdParts = (s) => { const [y, m, d] = s.split('-').map(Number); return [y, m - 1, d]; };
export const mondayOf = (s) => addDays(s, -((parseYmd(s).getDay() + 6) % 7));
export const weekdayIdx = (s) => (parseYmd(s).getDay() + 6) % 7; // Lun=0 … Dom=6
export const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
export const keyOf = (name) => name.trim().toLowerCase();
export const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// ---------- invitación a la pareja ----------
/** Letras y números que NO se confunden al leerlos o escribirlos (sin S/5, Z/2, B/8, O/0, I/1). */
export const INVITE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679';
/** Forma canónica de un código: mayúsculas y las parejas confusas unificadas. Así los códigos viejos y los errores de lectura (S↔5, Z↔2, B↔8, O↔0, I↔1) también sirven. */
export const canonInvite = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[S5]/g, '5').replace(/[Z2]/g, '2').replace(/[B8]/g, '8').replace(/O/g, '0').replace(/[I1]/g, '1');

/** La frase que tiene que escribir quien se une para aceptar. Se compara sin acentos, mayúsculas ni signos. */
export const PACT_PHRASE = 'acepto mi amor te amo mucho';
export const normalizePhrase = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const pactOk = (s) => normalizePhrase(s) === normalizePhrase(PACT_PHRASE);

// ---------- constantes de juego ----------
export const EARN = { checkin: 10, pr: 5, week: 20 };
export const PENALTY = { min: 1, max: 100 }; // puntos que la pareja puede quitar por un “hoy no fui” (también puede decidir 0: no quitar nada)
export const LIE_PENALTY = 5; // puntos que pierde quien dijo “lo hice” y su pareja confirma que NO lo hizo
export const SUPP_PENALTY = 5; // puntos que resta cada día sin tomar creatina o proteína (si la persona activó esa opción)
export const ESSENTIAL_SUPPS = ['creatina', 'proteina'];
export const MILESTONES = { 3: 10, 7: 25, 14: 40, 30: 100, 60: 150, 100: 250 };
// 24 colores para el acento personal (el selector también admite un color libre).
export const PALETTE = [
  '#FF453A', '#FF6B35', '#FF9F0A', '#FFD60A', '#B6F23A', '#30D158',
  '#34D6A0', '#2EC4B6', '#64D2FF', '#0A84FF', '#5E5CE6', '#8B7CFF',
  '#BF5AF2', '#FF5C93', '#FF375F', '#FF8A9B', '#C9A0FF', '#A8E6CF',
  '#E6B422', '#D4A373', '#8E8E93', '#6E7BFF', '#00C2A8', '#F472B6',
];

// ---------- color ----------
const rgb = (hex) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const luminance = (hex) => { const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
/** Texto sobre un color de acento. Los botones usan texto en negrita ≥17 pt (WCAG pide 3:1), así que se prefiere blanco y solo se pasa a casi negro cuando el blanco no llega a 3.5:1. */
export const onColor = (hex) => (contrast(hex, '#ffffff') >= 3.5 ? '#ffffff' : '#111114');

export function newDoc(id, name, color = PALETTE[6]) {
  return {
    v: 2, id, name, color, avatar: null, heightCm: null, weeklyGoal: 3, restDays: 2, shareWeight: false,
    weights: [], sessions: [], checkins: {}, pauses: [], ledger: [], routines: [], skips: {}, suppLog: {},
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// ---------- rachas ----------
export const gymDays = (doc) => Object.keys(doc.checkins).sort();

/** Días pausados (enfermedad, viaje) en el intervalo (a, b]. No cuentan como descanso "perdido". */
export function pausedBetween(doc, a, b) {
  let n = 0;
  for (const p of doc.pauses || []) {
    const from = p.from > a ? p.from : addDays(a, 1);
    const to = !p.to || p.to > b ? b : p.to;
    if (to >= from) n += diffDays(from, to) + 1;
  }
  return n;
}

/**
 * Racha tolerante a descansos: un día de gym se encadena con el anterior si entre ambos hay como máximo
 * `restDays` días sin ir (sin contar días en pausa). La racha cuenta días de gym, no días de calendario.
 * Una racha rota por falta de descanso no borra tu "mejor racha".
 */
export function streakInfo(doc, today = ymd()) {
  const days = gymDays(doc);
  const allow = (doc.restDays ?? 2) + 1;
  const gap = (a, b) => diffDays(a, b) - pausedBetween(doc, a, b);
  const chains = [];
  let cur = [];
  for (const d of days) {
    if (cur.length && gap(cur.at(-1), d) > allow) { chains.push(cur); cur = []; }
    cur.push(d);
  }
  if (cur.length) chains.push(cur);

  const last = days.at(-1) || null;
  const since = last ? gap(last, today) : null;
  const alive = last !== null && since <= allow;
  const chain = alive ? chains.at(-1) : [];
  return {
    current: chain.length,
    longest: Math.max(0, ...chains.map((c) => c.length)),
    chain,
    chains,
    last,
    total: days.length,
    doneToday: last === today,
    alive,
    atRisk: alive && last !== today && since === allow, // hoy es el último día para mantenerla
    daysLeft: alive ? allow - since : 0,
    paused: isPaused(doc, today),
  };
}

export const isPaused = (doc, date = ymd()) => (doc.pauses || []).some((p) => p.from <= date && (!p.to || p.to >= date));

export function weekCounts(doc) {
  const sets = {};
  for (const d of gymDays(doc)) (sets[mondayOf(d)] ||= new Set()).add(d);
  return Object.fromEntries(Object.entries(sets).map(([w, s]) => [w, s.size]));
}

/** Semanas seguidas cumpliendo la meta semanal (la semana en curso suma pero no rompe). */
export function weekStreak(doc, today = ymd()) {
  const counts = weekCounts(doc);
  let w = mondayOf(today);
  let n = (counts[w] || 0) >= doc.weeklyGoal ? 1 : 0;
  w = addDays(w, -7);
  while ((counts[w] || 0) >= doc.weeklyGoal) { n++; w = addDays(w, -7); }
  return n;
}

/** Racha de pareja: semanas seguidas en las que AMBOS cumplieron su meta. */
export function pairWeekStreak(a, b, today = ymd()) {
  if (!a || !b) return 0;
  const ca = weekCounts(a), cb = weekCounts(b);
  const both = (w) => (ca[w] || 0) >= a.weeklyGoal && (cb[w] || 0) >= b.weeklyGoal;
  let w = mondayOf(today);
  let n = both(w) ? 1 : 0;
  w = addDays(w, -7);
  while (both(w)) { n++; w = addDays(w, -7); }
  return n;
}

export function weekDots(doc, today = ymd()) {
  const start = mondayOf(today);
  return DAY_NAMES.map((label, i) => {
    const date = addDays(start, i);
    return { label: DAY_INITIALS[i], date, done: !!doc.checkins[date], today: date === today, future: date > today };
  });
}

/** Cuadrícula de un mes (lunes primero) con seis filas como máximo. */
export function monthGrid(year, month) {
  const first = ymd(new Date(year, month, 1));
  let d = mondayOf(first);
  const weeks = [];
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const date = addDays(d, i);
      return { date, inMonth: parseYmd(date).getMonth() === month };
    }));
    d = addDays(d, 7);
  } while (parseYmd(d).getMonth() === month);
  return weeks;
}

export function habits(doc) {
  const perDay = new Array(7).fill(0);
  const mins = [];
  for (const [date, c] of Object.entries(doc.checkins)) {
    perDay[weekdayIdx(date)]++;
    const [h, m] = (c.time || '').split(':').map(Number);
    if (Number.isFinite(h)) mins.push(h * 60 + (m || 0));
  }
  const max = Math.max(...perDay);
  const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
  return {
    total: Object.keys(doc.checkins).length,
    perDay,
    topDays: max ? perDay.flatMap((c, i) => (c === max ? [DAY_NAMES[i]] : [])) : [],
    avgTime: avg == null ? null : `${pad(Math.floor(avg / 60))}:${pad(avg % 60)}`,
  };
}

export const monthCount = (doc, prefix = ymd().slice(0, 7)) => Object.keys(doc.checkins).filter((d) => d.startsWith(prefix)).length;

// ---------- entrenos ----------
export const e1rm = (s) => (s.kg > 0 ? s.kg * (1 + s.reps / 30) : 0);
const sorted = (doc) => [...doc.sessions].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

export function exerciseCatalog(doc) {
  const map = new Map();
  for (const s of sorted(doc)) {
    for (const ex of s.exercises) {
      const k = keyOf(ex.name);
      const cur = map.get(k) || { key: k, name: ex.name, count: 0, last: '' };
      cur.count++;
      cur.last = s.date;
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last) || b.count - a.count);
}

export function lastPerformance(doc, key) {
  for (const s of sorted(doc).reverse()) {
    const ex = s.exercises.find((e) => keyOf(e.name) === key);
    if (ex) return { date: s.date, sets: ex.sets };
  }
  return null;
}

/**
 * Doble progresión: si todas las series con tu peso más alto llegaron al tope de reps, sube el peso
 * y vuelve al mínimo; si no, mismo peso y una repetición más que tu peor serie.
 */
export function suggestNext(doc, name, { repMin = 8, repMax = 12, inc = 2.5 } = {}) {
  const last = lastPerformance(doc, keyOf(name));
  if (!last || !last.sets.length) return null;
  const top = Math.max(...last.sets.map((s) => s.kg));
  const atTop = last.sets.filter((s) => s.kg === top);
  const minReps = Math.min(...atTop.map((s) => s.reps));
  const base = { sets: last.sets.length, last };
  if (top === 0) return { ...base, kg: 0, reps: minReps + 1, up: false };
  if (atTop.every((s) => s.reps >= repMax)) return { ...base, kg: top + inc, reps: repMin, up: true };
  return { ...base, kg: top, reps: Math.min(repMax, minReps + 1), up: false };
}

export function exerciseSeries(doc, key) {
  const out = [];
  for (const s of sorted(doc)) {
    const ex = s.exercises.find((e) => keyOf(e.name) === key);
    if (!ex) continue;
    out.push({ date: s.date, top: Math.max(...ex.sets.map((x) => x.kg)), e1rm: Math.max(...ex.sets.map(e1rm)), reps: Math.max(...ex.sets.map((x) => x.reps)) });
  }
  return out;
}

export const sessionVolume = (s) => s.exercises.reduce((a, ex) => a + ex.sets.reduce((b, x) => b + x.kg * x.reps, 0), 0);
export const sessionSets = (s) => s.exercises.reduce((a, ex) => a + ex.sets.length, 0);

/** Récords que traería una sesión nueva frente al historial existente. */
export function findPRs(doc, session) {
  const prs = [];
  const before = { ...doc, sessions: doc.sessions.filter((s) => s.id !== session.id) };
  for (const ex of session.exercises) {
    const k = keyOf(ex.name);
    const prev = Math.max(0, ...exerciseSeries(before, k).map((x) => x.e1rm));
    const now = Math.max(...ex.sets.map(e1rm));
    if (prev > 0 && now > prev) prs.push(ex.name);
  }
  return prs;
}

// ---------- tokens ----------
/**
 * Los tokens "automáticos" se derivan de los datos y se reconcilian aquí: borrar un entreno o bajar el agua
 * revierte su premio y nunca se cobra dos veces. Los canjes (entradas con `ref`) son manuales y no se tocan.
 */
export function recomputeAwards(doc, extra = {}) {
  const want = new Map();
  const put = (key, delta, reason, date) => want.set(key, { key, delta, reason, date });

  const info = streakInfo(doc);
  for (const d of gymDays(doc)) put(`gym:${d}`, EARN.checkin, 'Fuiste al gimnasio', d);
  for (const chain of info.chains) {
    for (const [n, bonus] of Object.entries(MILESTONES)) {
      if (chain.length >= Number(n)) put(`streak:${chain[0]}:${n}`, bonus, `Racha de ${n} días 🔥`, chain[Number(n) - 1]);
    }
  }

  // “Hoy no fui”: tu pareja decide cuántos puntos (1 a 100) te quita. Mientras no decida, no resta; si al final entrenas o estás en pausa, tampoco.
  for (const [d, sk] of Object.entries(doc.skips || {})) {
    const pts = Math.round(Number(extra.skipPenalties?.[d]));
    if (pts >= PENALTY.min && !doc.checkins[d] && !pausedBetween(doc, addDays(d, -1), d)) put(`skip:${d}`, -Math.min(pts, PENALTY.max), `No fui: ${String(sk.reason || '').slice(0, 60)}`, d);
  }

  // Suplementos esenciales: si activó la opción, cada día que pasa sin tomar creatina o proteína resta puntos (el de hoy aún no cuenta).
  for (const d of suppMissedDays(doc)) put(`supp:${d.date}`, -SUPP_PENALTY, `Faltó ${d.missing.join(' y ')}`.toLowerCase().replace(/^f/, 'F'), d.date);

  const best = new Map();
  for (const s of sorted(doc)) {
    for (const ex of s.exercises) {
      const k = keyOf(ex.name);
      const top = Math.max(...ex.sets.map(e1rm));
      if (best.has(k) && top > best.get(k)) put(`pr:${k}:${s.id}`, EARN.pr, `Récord en ${ex.name}`, s.date);
      best.set(k, Math.max(best.get(k) || 0, top));
    }
  }

  for (const [week, count] of Object.entries(weekCounts(doc))) {
    if (count >= doc.weeklyGoal) put(`week:${week}`, EARN.week, `Meta semanal (${count}/${doc.weeklyGoal})`, addDays(week, 6));
  }
  for (const c of extra.challenges || []) {
    if (c.status === 'approved' && c.to === doc.id) put(`challenge:${c.id}`, c.points, `Reto cumplido: ${c.title}`, ymd(new Date(c.approvedAt || c.ts)));
  }

  const kept = doc.ledger.filter((e) => !e.key || e.key.startsWith('bank:') || want.has(e.key)); // `bank:` = puntos fijados al desvincularse
  for (const e of kept) { const w = e.key && want.get(e.key); if (w && e.delta !== w.delta) { e.delta = w.delta; e.reason = w.reason; } } // p. ej. la pareja cambió la penalización
  const have = new Set(kept.map((e) => e.key).filter(Boolean));
  for (const w of want.values()) if (!have.has(w.key)) kept.push({ id: uid(), ts: Date.now(), ...w });
  doc.ledger = kept;
  return doc;
}

export const balance = (doc) => doc.ledger.reduce((a, e) => a + e.delta, 0);
export const ledgerSorted = (doc) => [...doc.ledger].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);

// ---------- suplementos ----------
export const DEFAULT_SUPPS = [
  { id: 'creatina', name: 'Creatina', emoji: '⚡', when: 'gym' },
  { id: 'proteina', name: 'Proteína', emoji: '🥤', when: 'gym' },
];
/** Mi lista de suplementos: creatina y proteína por defecto, más lo que agregue. */
export const suppList = (doc) => doc.supps ?? DEFAULT_SUPPS;
export const suppTaken = (doc, date = ymd()) => new Set(doc.suppLog?.[date] || []);
/** Últimos 7 días (terminando en hoy): 'all' si tomó todo, 'some' si tomó algo, 'none' si nada. */
export function suppWeek(doc, today = ymd()) {
  const list = suppList(doc);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const n = list.filter((x) => suppTaken(doc, date).has(x.id)).length;
    return { date, today: date === today, state: list.length && n === list.length ? 'all' : n ? 'some' : 'none' };
  });
}
export const skipToday = (doc, today = ymd()) => doc.skips?.[today] || null;
/** Días ya pasados (desde que activó la opción) en que faltó la creatina o la proteína. Hoy no cuenta: aún puede tomárselas. */
export function suppMissedDays(doc, today = ymd()) {
  const since = doc.suppPenaltySince;
  if (!since) return [];
  const essentials = suppList(doc).filter((x) => ESSENTIAL_SUPPS.includes(x.id));
  if (!essentials.length) return [];
  const out = [];
  const from = since < addDays(today, -60) ? addDays(today, -60) : since;
  for (let d = from; d < today; d = addDays(d, 1)) {
    if (pausedBetween(doc, addDays(d, -1), d)) continue;
    const taken = suppTaken(doc, d);
    const missing = essentials.filter((x) => !taken.has(x.id)).map((x) => x.name);
    if (missing.length) out.push({ date: d, missing });
  }
  return out;
}
/** Si el saldo es negativo, lo que debe. */
export const debt = (doc) => Math.max(0, -balance(doc));

// ---------- ejercicios comunes (para agregar rápido) ----------
export const LIBRARY = [
  ['Pecho', ['Press banca', 'Press inclinado con mancuernas', 'Aperturas', 'Fondos', 'Press en máquina', 'Cruces en polea']],
  ['Espalda', ['Dominadas', 'Jalón al pecho', 'Remo con barra', 'Remo con mancuerna', 'Remo en polea', 'Peso muerto']],
  ['Pierna', ['Sentadilla', 'Prensa', 'Peso muerto rumano', 'Zancadas', 'Hip thrust', 'Extensión de cuádriceps', 'Curl femoral', 'Elevación de talones', 'Abducción en máquina']],
  ['Hombro', ['Press militar', 'Elevaciones laterales', 'Pájaros', 'Face pull', 'Press Arnold']],
  ['Brazo', ['Curl con barra', 'Curl martillo', 'Press francés', 'Extensión en polea', 'Fondos en banco']],
  ['Core', ['Plancha', 'Crunch', 'Elevación de piernas', 'Rueda abdominal']],
  ['Cardio', ['Caminadora', 'Elíptica', 'Bicicleta', 'Escaladora']],
];

// ---------- análisis mensual ----------
const monthPrefix = (y, m) => `${y}-${pad(m + 1)}`;
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

export function monthAttended(doc, y, m) { return Object.keys(doc.checkins).filter((d) => d.startsWith(monthPrefix(y, m))).length; }

/** Cuántos días fuiste, cuántos “debías” según tu meta semanal, y cómo va cada semana. */
/** Mosaico de constancia: las últimas `weeks` semanas (columnas, de lunes a domingo). */
export function mosaic(doc, weeks = 12, today = ymd()) {
  const first = addDays(mondayOf(today), -(weeks - 1) * 7);
  const withSession = new Set(doc.sessions.map((s) => s.date));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(first, w * 7 + i);
    const state = date > today ? 'future' : doc.checkins[date] ? (withSession.has(date) ? 'strong' : 'on') : pausedBetween(doc, addDays(date, -1), date) ? 'pause' : 'none';
    return { date, state, today: date === today };
  }));
}
/** Siguiente hito de racha (3, 7, 14, 30, 60, 100) y el anterior, para el anillo de la racha. */
export function nextMilestone(current) {
  const ms = Object.keys(MILESTONES).map(Number).sort((a, b) => a - b);
  const next = ms.find((m) => m > current) || current || 1;
  const prev = [0, ...ms].filter((m) => m <= current).at(-1);
  return { next, prev };
}

export function monthReport(doc, y, m, today = ymd()) {
  const pre = monthPrefix(y, m);
  const first = `${pre}-01`;
  const end = `${pre}-${pad(daysIn(y, m))}`;
  const last = today < end ? today : end;
  if (today < first) return null; // mes futuro
  // Solo se “debe” lo que pasó desde que empezaste a usar la app (no se te culpa por días anteriores).
  const created = ymd(new Date(doc.createdAt || 0));
  const start = created > first ? created : first;
  const elapsed = start > last ? 0 : diffDays(start, last) + 1;
  const paused = elapsed ? pausedBetween(doc, addDays(start, -1), last) : 0;
  const active = Math.max(0, elapsed - paused);
  const days = Object.keys(doc.checkins).filter((d) => d.startsWith(pre) && d <= last).sort();
  const attended = days.length;
  const expected = Math.min(active, Math.round((doc.weeklyGoal * active) / 7));
  const missed = Math.max(0, expected - attended);

  const weeks = [];
  for (let w = mondayOf(start); w <= last; w = addDays(w, 7)) {
    const inMonth = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter((d) => d >= start && d <= end);
    if (!inMonth.length) continue;
    const count = inMonth.filter((d) => d <= today && doc.checkins[d]).length;
    const goal = Math.max(1, Math.ceil((doc.weeklyGoal * inMonth.length) / 7));
    weeks.push({ start: inMonth[0], count, goal, hit: count >= goal, current: inMonth.includes(today), days: inMonth.length });
  }

  const info = streakInfo(doc, last);
  const bestChain = Math.max(0, ...info.chains.map((c) => c.filter((d) => d.startsWith(pre)).length));
  const sessions = doc.sessions.filter((s) => s.date.startsWith(pre) && s.date <= last);
  const pm = m === 0 ? [y - 1, 11] : [y, m - 1];
  const prevEnd = `${monthPrefix(pm[0], pm[1])}-${pad(daysIn(pm[0], pm[1]))}`;
  const perDay = new Array(7).fill(0);
  const mins = [];
  for (const d of days) {
    perDay[weekdayIdx(d)]++;
    const [h, mm] = (doc.checkins[d].time || '').split(':').map(Number);
    if (Number.isFinite(h)) mins.push(h * 60 + (mm || 0));
  }
  const top = Math.max(...perDay);
  const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
  return {
    attended, expected, missed, elapsed, paused,
    pct: expected ? Math.min(100, Math.round((attended / expected) * 100)) : attended ? 100 : 0,
    weeks, weeksHit: weeks.filter((w) => w.hit).length,
    bestChain,
    prev: created > prevEnd ? null : monthAttended(doc, pm[0], pm[1]), // null = aún no usabas la app ese mes
    sessions: sessions.length,
    sets: sessions.reduce((a, s) => a + sessionSets(s), 0),
    volume: sessions.reduce((a, s) => a + sessionVolume(s), 0),
    prs: doc.ledger.filter((e) => e.key?.startsWith('pr:') && e.date.startsWith(pre)).length,
    topDays: top ? perDay.flatMap((c, i) => (c === top ? [DAY_NAMES[i]] : [])) : [],
    avgTime: avg == null ? null : `${pad(Math.floor(avg / 60))}:${pad(avg % 60)}`,
    perDay,
  };
}

/** Días de gym por mes (los últimos `n`), para ver la tendencia con el paso de los meses. */
export function monthlyCounts(doc, n = 6, today = ymd()) {
  const t = parseYmd(today);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(t.getFullYear(), t.getMonth() - (n - 1 - i), 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''), count: monthAttended(doc, d.getFullYear(), d.getMonth()) };
  });
}

// ---------- rutinas ----------
/** Una rutina guarda ejercicios como texto (las antiguas) o como { name, sets, reps } (las compartidas). */
export const routineItems = (r) => r.exercises.map((e) => (typeof e === 'string' ? { name: e } : e));

export const GROUP_COLORS = { Pecho: '#ff5c93', Espalda: '#38bdf8', Pierna: '#34d6a0', Hombro: '#ff9f0a', Brazo: '#8b7cff', Core: '#ffd60a', Cardio: '#ff453a' };
export function groupOf(name) {
  const k = keyOf(name);
  return LIBRARY.find(([, list]) => list.some((x) => keyOf(x) === k))?.[0] || null;
}

// ---------- plantillas para empezar rápido ----------
export const TEMPLATES = [
  { id: 'push', name: 'Empuje', sub: 'Pecho · hombro · tríceps', exercises: ['Press banca', 'Press inclinado con mancuernas', 'Press militar', 'Elevaciones laterales', 'Extensión en polea'] },
  { id: 'pull', name: 'Tirón', sub: 'Espalda · bíceps', exercises: ['Jalón al pecho', 'Remo con barra', 'Remo en polea', 'Face pull', 'Curl con barra'] },
  { id: 'legs', name: 'Pierna', sub: 'Cuádriceps · glúteo · femoral', exercises: ['Sentadilla', 'Prensa', 'Peso muerto rumano', 'Hip thrust', 'Curl femoral', 'Elevación de talones'] },
  { id: 'full', name: 'Cuerpo completo', sub: 'Todo en una sesión', exercises: ['Sentadilla', 'Press banca', 'Remo con mancuerna', 'Press militar', 'Plancha'] },
];

// ---------- tablero de motivación ----------
export const PHRASES = [
  'Orgullo total de verte constante 💗', 'Un día más, una versión más fuerte de ti 💪', 'Hoy lo vas a lograr, lo sé',
  'Tu esfuerzo de hoy es tu orgullo de mañana ✨', 'No tiene que ser perfecto, solo tiene que ser hoy',
  'Mírate: cada día más fuerte 🔥', 'Cuando no tengas ganas, acuérdate de por qué empezaste', 'Eres mi persona favorita para entrenar 💞',
  'Un set más y ya estás ahí', 'Qué bonito verte cuidarte así', 'Aunque estés cansado, sigues viniendo. Eso es disciplina', 'Te mando toda mi energía para tu entreno ⚡',
];
