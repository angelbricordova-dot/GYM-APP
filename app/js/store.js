// Estado + lógica de la app. Todo se guarda en localStorage (Fase 1).
// La UI nunca toca localStorage directo: pasa por get()/mutate().

const KEY = 'gymapp.v1';

export const EARN = { gym: 10, water: 5, pr: 5, week: 20 };
export const COLORS = ['#7c5cff', '#ff5c8a', '#2ee6a6', '#38bdf8'];
export const EMOJIS = ['💪', '🔥', '🦁', '🌸', '⚡', '🐯', '🦋', '🏋️'];
export const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const DEFAULT_REWARDS = [
  { id: 'r1', name: 'Helado juntos', emoji: '🍦', cost: 50 },
  { id: 'r2', name: 'Pizza de noche', emoji: '🍕', cost: 120 },
  { id: 'r3', name: 'Salida al cine', emoji: '🎬', cost: 200 },
  { id: 'r4', name: 'Cena especial', emoji: '🍽️', cost: 300 },
  { id: 'r5', name: 'Día de spa', emoji: '💆', cost: 400 },
];

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
export const mondayOf = (s) => addDays(s, -((parseYmd(s).getDay() + 6) % 7));
const weekday = (s) => (parseYmd(s).getDay() + 6) % 7; // Lun=0 … Dom=6
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
export const keyOf = (name) => name.trim().toLowerCase();
const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// ---------- persistencia ----------
let state = load();
const listeners = new Set();

function fresh() {
  return { v: 1, active: null, profiles: [], rewards: DEFAULT_REWARDS.map((r) => ({ ...r })) };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.profiles)) return s;
    }
  } catch (e) { /* storage bloqueado o JSON dañado: arrancamos limpio */ }
  return fresh();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sin storage */ }
}

export const get = () => state;
export const subscribe = (fn) => listeners.add(fn);

/** Ejecuta un cambio, recalcula tokens automáticos, guarda y avisa a la UI. */
export function mutate(fn) {
  fn(state);
  state.profiles.forEach(recomputeAwards);
  save();
  listeners.forEach((fn) => fn());
}

export const current = () => state.profiles.find((p) => p.id === state.active) || state.profiles[0] || null;
export const balance = (p) => p.ledger.reduce((a, e) => a + e.delta, 0);

export function exportJSON() { return JSON.stringify(state, null, 2); }
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || !Array.isArray(s.profiles) || !Array.isArray(s.rewards)) throw new Error('Formato inválido');
  mutate((st) => Object.assign(st, s));
}

// ---------- perfiles ----------
export function addProfile({ name, emoji, heightCm, weightKg, weeklyGoal }) {
  const id = uid();
  mutate((st) => {
    const p = {
      id,
      name: name.trim() || 'Sin nombre',
      emoji: emoji || EMOJIS[0],
      color: COLORS[st.profiles.length % COLORS.length],
      heightCm: num(heightCm) || null,
      weeklyGoal: Math.max(1, Math.min(7, Math.round(num(weeklyGoal)) || 3)),
      waterGoalMl: 2000,
      weights: [],
      sessions: [],
      water: {},
      ledger: [],
    };
    if (num(weightKg)) p.weights.push({ date: ymd(), kg: num(weightKg) });
    st.profiles.push(p);
    st.active = id;
  });
}

export function updateProfile(id, { name, emoji, heightCm, weeklyGoal, waterGoalMl }) {
  mutate((st) => {
    const p = st.profiles.find((x) => x.id === id);
    if (!p) return;
    if (name && name.trim()) p.name = name.trim();
    if (emoji) p.emoji = emoji;
    p.heightCm = num(heightCm) || null;
    p.weeklyGoal = Math.max(1, Math.min(7, Math.round(num(weeklyGoal)) || p.weeklyGoal));
    p.waterGoalMl = Math.max(500, Math.round(num(waterGoalMl)) || p.waterGoalMl);
  });
}

export const setActive = (id) => mutate((st) => { st.active = id; });

export function logWeight(p, kg, date) {
  if (!num(kg)) return;
  mutate(() => {
    const d = date || ymd();
    p.weights = p.weights.filter((w) => w.date !== d);
    p.weights.push({ date: d, kg: num(kg) });
    p.weights.sort((a, b) => a.date.localeCompare(b.date));
  });
}

// ---------- entrenamientos ----------
export function addSession(p, { date, time, exercises, note }) {
  const clean = exercises
    .map((ex) => ({
      name: ex.name.trim(),
      sets: ex.sets
        .map((s) => ({ kg: num(s.kg), reps: Math.round(num(s.reps)) }))
        .filter((s) => s.reps > 0),
    }))
    .filter((ex) => ex.name && ex.sets.length);
  if (!clean.length) return false;
  mutate(() => {
    p.sessions.push({ id: uid(), date: date || ymd(), time: time || hm(), exercises: clean, note: (note || '').trim() });
    p.sessions.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  });
  return true;
}

export const deleteSession = (p, id) => mutate(() => { p.sessions = p.sessions.filter((s) => s.id !== id); });

const e1rm = (s) => (s.kg > 0 ? s.kg * (1 + s.reps / 30) : 0);

function sortedSessions(p) { return [...p.sessions].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); }

/** Catálogo de ejercicios usados, del más reciente al más antiguo. */
export function exerciseCatalog(p) {
  const map = new Map();
  for (const s of sortedSessions(p)) {
    for (const ex of s.exercises) {
      const k = keyOf(ex.name);
      const cur = map.get(k) || { key: k, name: ex.name, count: 0, last: '' };
      cur.count++;
      cur.last = s.date;
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
}

export function lastPerformance(p, key) {
  const sessions = sortedSessions(p).reverse();
  for (const s of sessions) {
    const ex = s.exercises.find((e) => keyOf(e.name) === key);
    if (ex) return { date: s.date, sets: ex.sets };
  }
  return null;
}

/**
 * Sobrecarga progresiva (doble progresión):
 * - Si todas las series del peso más alto llegaron al tope de reps → sube el peso y vuelve al mínimo de reps.
 * - Si no → mismo peso, una rep más que tu peor serie.
 */
export function suggestNext(p, name, { repMin = 8, repMax = 12, inc = 2.5 } = {}) {
  const last = lastPerformance(p, keyOf(name));
  if (!last) return null;
  const top = Math.max(...last.sets.map((s) => s.kg));
  const atTop = last.sets.filter((s) => s.kg === top);
  const minReps = Math.min(...atTop.map((s) => s.reps));
  const base = { sets: last.sets.length, last };
  if (top === 0) return { ...base, kg: 0, reps: minReps + 1, up: false }; // peso corporal
  if (atTop.every((s) => s.reps >= repMax)) return { ...base, kg: top + inc, reps: repMin, up: true };
  return { ...base, kg: top, reps: Math.min(repMax, minReps + 1), up: false };
}

/** Serie histórica de un ejercicio: mejor peso y 1RM estimado por sesión. */
export function exerciseSeries(p, key) {
  const out = [];
  for (const s of sortedSessions(p)) {
    const ex = s.exercises.find((e) => keyOf(e.name) === key);
    if (!ex) continue;
    out.push({
      date: s.date,
      top: Math.max(...ex.sets.map((x) => x.kg)),
      e1rm: Math.max(...ex.sets.map(e1rm)),
      reps: Math.max(...ex.sets.map((x) => x.reps)),
    });
  }
  return out;
}

// ---------- estadísticas ----------
export function weekCounts(p) {
  const days = {};
  for (const s of p.sessions) (days[mondayOf(s.date)] ||= new Set()).add(s.date);
  return Object.fromEntries(Object.entries(days).map(([w, set]) => [w, set.size]));
}

export function weekStreak(p) {
  const counts = weekCounts(p);
  let w = mondayOf(ymd());
  let streak = (counts[w] || 0) >= p.weeklyGoal ? 1 : 0; // la semana en curso suma, pero no rompe la racha
  w = addDays(w, -7);
  while ((counts[w] || 0) >= p.weeklyGoal) { streak++; w = addDays(w, -7); }
  return streak;
}

export function recentWeeks(p, n = 8) {
  const counts = weekCounts(p);
  const start = mondayOf(ymd());
  return Array.from({ length: n }, (_, i) => {
    const week = addDays(start, -7 * (n - 1 - i));
    return { week, count: counts[week] || 0, hit: (counts[week] || 0) >= p.weeklyGoal };
  });
}

export function weekDots(p) {
  const start = mondayOf(ymd());
  const dates = new Set(p.sessions.map((s) => s.date));
  return DAY_NAMES.map((label, i) => ({ label, done: dates.has(addDays(start, i)), today: addDays(start, i) === ymd() }));
}

/** Días y horas en que sueles ir. */
export function habits(p) {
  const perDay = new Array(7).fill(0);
  const seen = new Set();
  const minutes = [];
  for (const s of p.sessions) {
    if (seen.has(s.date)) continue; // un día con dos registros cuenta una vez
    seen.add(s.date);
    perDay[weekday(s.date)]++;
    const [h, m] = (s.time || '').split(':').map(Number);
    if (Number.isFinite(h)) minutes.push(h * 60 + (m || 0));
  }
  const max = Math.max(...perDay);
  const topDays = max ? perDay.flatMap((c, i) => (c === max ? [DAY_NAMES[i]] : [])) : [];
  const avg = minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null;
  return {
    total: seen.size,
    perDay,
    topDays,
    avgTime: avg == null ? null : `${pad(Math.floor(avg / 60))}:${pad(avg % 60)}`,
  };
}

export function monthCount(p) {
  const prefix = ymd().slice(0, 7);
  return new Set(p.sessions.filter((s) => s.date.startsWith(prefix)).map((s) => s.date)).size;
}

export const bmi = (p) => {
  const w = p.weights.at(-1)?.kg;
  return w && p.heightCm ? w / (p.heightCm / 100) ** 2 : null;
};

// ---------- agua ----------
export const waterToday = (p) => p.water[ymd()] || 0;

export function addWater(p, ml, date = ymd()) {
  mutate(() => { p.water[date] = Math.max(0, (p.water[date] || 0) + ml); });
}

export function lastDaysWater(p, n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(ymd(), -(n - 1 - i));
    return { date, ml: p.water[date] || 0 };
  });
}

// ---------- tokens ----------
/**
 * Los tokens "automáticos" se derivan de los datos (entrenos, agua, PRs, semanas)
 * y se reconcilian aquí. Así borrar un entreno o bajar el agua revierte su premio
 * y nunca se cobra dos veces. Los canjes son entradas manuales y no se tocan.
 */
function recomputeAwards(p) {
  const want = new Map();
  const put = (key, delta, reason, date) => want.set(key, { key, delta, reason, date });

  const gymDays = new Set(p.sessions.map((s) => s.date));
  gymDays.forEach((d) => put(`gym:${d}`, EARN.gym, 'Fuiste al gimnasio', d));

  const best = new Map();
  for (const s of sortedSessions(p)) {
    for (const ex of s.exercises) {
      const k = keyOf(ex.name);
      const top = Math.max(...ex.sets.map(e1rm));
      if (best.has(k) && top > best.get(k)) put(`pr:${k}:${s.id}`, EARN.pr, `Récord en ${ex.name}`, s.date);
      best.set(k, Math.max(best.get(k) || 0, top));
    }
  }

  for (const [week, count] of Object.entries(weekCounts(p))) {
    if (count >= p.weeklyGoal) put(`week:${week}`, EARN.week, `Meta semanal cumplida (${count}/${p.weeklyGoal})`, addDays(week, 6));
  }

  for (const [d, ml] of Object.entries(p.water)) {
    if (ml >= p.waterGoalMl) put(`water:${d}`, EARN.water, `Meta de agua (${p.waterGoalMl / 1000} L)`, d);
  }

  const kept = p.ledger.filter((e) => !e.key || want.has(e.key));
  const have = new Set(kept.map((e) => e.key).filter(Boolean));
  for (const w of want.values()) if (!have.has(w.key)) kept.push({ id: uid(), ts: Date.now(), ...w });
  p.ledger = kept;
}

export function redeem(p, rewardId) {
  const r = state.rewards.find((x) => x.id === rewardId);
  if (!r || balance(p) < r.cost) return false;
  mutate(() => p.ledger.push({ id: uid(), ts: Date.now(), date: ymd(), delta: -r.cost, reason: `Canje: ${r.emoji} ${r.name}` }));
  return true;
}

export function addReward({ name, emoji, cost }) {
  if (!name.trim() || !num(cost)) return;
  mutate((st) => st.rewards.push({ id: uid(), name: name.trim(), emoji: emoji.trim() || '🎁', cost: Math.round(num(cost)) }));
}

export const removeReward = (id) => mutate((st) => { st.rewards = st.rewards.filter((r) => r.id !== id); });

export const ledgerSorted = (p) => [...p.ledger].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
