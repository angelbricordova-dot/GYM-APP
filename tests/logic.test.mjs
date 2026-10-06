import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/logic.js';

const doc = (days, extra = {}) => ({ ...L.newDoc('u', 'T'), createdAt: Date.parse('2026-01-01T12:00:00'), checkins: Object.fromEntries(days.map((d) => [d, { ts: 1, time: '18:00' }])), ...extra });

test('racha: días seguidos y descansos permitidos (por defecto 2)', () => {
  const d = doc(['2026-10-01', '2026-10-02', '2026-10-05']); // hueco de 2 días de descanso: se mantiene
  const s = L.streakInfo(d, '2026-10-05');
  assert.equal(s.current, 3);
  assert.equal(s.doneToday, true);
  assert.equal(L.streakInfo(doc(['2026-10-01', '2026-10-06']), '2026-10-06').current, 1); // 4 días de descanso: se rompe
});

test('racha: en riesgo hoy, rota después, y la mejor racha se conserva', () => {
  const d = doc(['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(L.streakInfo(d, '2026-10-05').atRisk, false);
  assert.deepEqual([L.streakInfo(d, '2026-10-06').atRisk, L.streakInfo(d, '2026-10-06').daysLeft], [true, 0]);
  const broken = L.streakInfo(d, '2026-10-07');
  assert.equal(broken.current, 0);
  assert.equal(broken.longest, 3);
});

test('racha: la pausa por enfermedad o viaje no rompe la racha', () => {
  const d = doc(['2026-10-01', '2026-10-10'], { pauses: [{ from: '2026-10-02', to: '2026-10-09' }] });
  assert.equal(L.streakInfo(d, '2026-10-10').current, 2);
  const open = doc(['2026-10-01'], { pauses: [{ from: '2026-10-02', to: null }] });
  assert.equal(L.streakInfo(open, '2026-10-20').alive, true);
  assert.equal(L.streakInfo(open, '2026-10-20').paused, true);
});

test('racha semanal y de pareja', () => {
  const a = doc(['2026-09-28', '2026-09-30', '2026-10-02'], { weeklyGoal: 3 }); // semana del 28 completa
  const b = doc(['2026-09-28', '2026-09-29'], { weeklyGoal: 2 });
  assert.equal(L.weekStreak(a, '2026-10-04'), 1);
  assert.equal(L.pairWeekStreak(a, b, '2026-10-04'), 1);
  assert.equal(L.pairWeekStreak(a, null), 0);
});

test('puntos de amor: gym + hitos + récord, y se revierten al borrar', () => {
  const d = doc(['2026-10-01', '2026-10-02', '2026-10-03']);
  d.sessions = [
    { id: 's1', date: '2026-10-01', time: '18:00', exercises: [{ name: 'Press banca', sets: [{ kg: 40, reps: 10 }] }] },
    { id: 's2', date: '2026-10-03', time: '18:00', exercises: [{ name: 'press BANCA', sets: [{ kg: 45, reps: 8 }] }] },
  ];
  L.recomputeAwards(d);
  // 3 días ×10 + hito de 3 días (10) + récord 5 + semana (3/3) 20
  assert.equal(L.balance(d), 30 + 10 + 5 + 20);
  L.recomputeAwards(d);
  assert.equal(L.balance(d), 65); // idempotente
  d.sessions.pop();
  L.recomputeAwards(d);
  assert.equal(L.balance(d), 60);
  d.ledger.push({ id: 'c', ts: 1, date: '2026-10-04', delta: -50, reason: 'Canje', ref: 'v1' });
  L.recomputeAwards(d);
  assert.equal(L.balance(d), 10); // los canjes se respetan
});

test('sobrecarga progresiva: sube peso al llegar al tope, si no suma una rep', () => {
  const mk = (sets) => ({ ...L.newDoc('u', 'T'), sessions: [{ id: 'a', date: '2026-10-01', time: '10:00', exercises: [{ name: 'Press', sets }] }] });
  assert.deepEqual(pick(L.suggestNext(mk([{ kg: 40, reps: 12 }, { kg: 40, reps: 12 }]), 'press')), { kg: 42.5, reps: 8, up: true });
  assert.deepEqual(pick(L.suggestNext(mk([{ kg: 40, reps: 12 }, { kg: 40, reps: 9 }]), 'PRESS')), { kg: 40, reps: 10, up: false });
  assert.equal(L.suggestNext(mk([]), 'nada'), null);
  function pick({ kg, reps, up }) { return { kg, reps, up }; }
});

test('calendario: cuadrícula con semanas completas lunes→domingo', () => {
  const g = L.monthGrid(2026, 9); // octubre 2026
  assert.ok(g.every((w) => w.length === 7));
  assert.equal(L.weekdayIdx(g[0][0].date), 0);
  assert.equal(g.flat().filter((c) => c.inMonth).length, 31);
});

test('retos aprobados suman puntos solo a quien los cumplió, una vez, y se revierten', () => {
  const d = { ...doc([]), id: 'ella' };
  const ch = [
    { id: 'c1', to: 'ella', status: 'approved', points: 20, title: '10 flexiones', approvedAt: Date.parse('2026-10-05T12:00:00') },
    { id: 'c2', to: 'ella', status: 'submitted', points: 50, title: 'Plancha', ts: 1 },
    { id: 'c3', to: 'otro', status: 'approved', points: 99, title: 'Ajeno', ts: 1 },
  ];
  L.recomputeAwards(d, { challenges: ch });
  L.recomputeAwards(d, { challenges: ch });
  assert.equal(L.balance(d), 20);
  assert.equal(d.ledger[0].date, '2026-10-05');
  L.recomputeAwards(d, { challenges: [] });
  assert.equal(L.balance(d), 0);
});

test('análisis del mes: días que fue, días que faltó y semanas cumplidas', () => {
  const d = doc(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-08', '2026-09-30'], { weeklyGoal: 3 });
  const r = L.monthReport(d, 2026, 9, '2026-10-14'); // 14 días transcurridos
  assert.equal(r.attended, 5);
  assert.equal(r.expected, 6); // 3 por semana × 2 semanas
  assert.equal(r.missed, 1);
  assert.equal(r.pct, 83);
  assert.equal(r.prev, 1); // septiembre
  assert.equal(r.weeks.length, 3);
  assert.deepEqual(r.weeks.map((w) => [w.count, w.hit]), [[2, true], [3, true], [0, false]]); // 1-4 oct (meta prorrateada a 2), 5-11, 12-14 en curso
  assert.equal(L.monthReport(d, 2026, 10, '2026-10-14'), null); // noviembre aún no existe
  const withPause = doc(['2026-10-01'], { weeklyGoal: 3, pauses: [{ from: '2026-10-02', to: '2026-10-14' }] });
  assert.equal(L.monthReport(withPause, 2026, 9, '2026-10-14').expected, 0); // en pausa no se “debe” nada
});

test('tendencia de los últimos meses', () => {
  const d = doc(['2026-08-03', '2026-09-01', '2026-09-02', '2026-10-01']);
  assert.deepEqual(L.monthlyCounts(d, 3, '2026-10-14').map((x) => x.count), [1, 2, 1]);
});

test('paleta: todos los acentos permiten texto legible y el nombre del color es un hex válido', () => {
  assert.equal(L.PALETTE.length, 24);
  for (const c of L.PALETTE) {
    assert.match(c, /^#[0-9A-F]{6}$/i);
    assert.ok(L.contrast(c, L.onColor(c)) >= 3, `${c} con ${L.onColor(c)} = ${L.contrast(c, L.onColor(c)).toFixed(2)}`);
  }
});

test('plantillas y frases listas para usar', () => {
  assert.ok(L.TEMPLATES.every((t) => t.exercises.length >= 4));
  assert.ok(L.PHRASES.length >= 10);
});

test('análisis del mes: solo cuenta desde que empezaste a usar la app', () => {
  const d = doc(['2026-10-07'], { weeklyGoal: 3, createdAt: Date.parse('2026-10-05T10:00:00') });
  const r = L.monthReport(d, 2026, 9, '2026-10-11'); // usa la app del 5 al 11 = 7 días
  assert.equal(r.elapsed, 7);
  assert.equal(r.expected, 3);
  assert.equal(r.missed, 2);
  assert.equal(r.weeks.length, 1); // solo la semana del 5 al 11: el 1-4 de octubre no cuenta
  assert.equal(r.prev, null); // septiembre: aún no usaba la app
  assert.equal(L.monthReport(d, 2026, 9, '2026-10-02').expected, 0); // antes de empezar no se debe nada
});

test('“hoy no voy” resta puntos de amor; si ese día entrenas o estás en pausa, no resta', () => {
  const d = doc(['2026-10-01'], { skips: { '2026-10-02': { reason: 'flojera', ts: 1 }, '2026-10-01': { reason: 'x', ts: 1 } } });
  L.recomputeAwards(d);
  const skips = d.ledger.filter((e) => e.key?.startsWith('skip:'));
  assert.deepEqual(skips.map((e) => [e.key, e.delta]), [['skip:2026-10-02', -L.EARN.skip]]); // el 1 sí entrenó
  assert.match(skips[0].reason, /flojera/);
  assert.equal(L.balance(d), L.EARN.checkin - L.EARN.skip);
  d.checkins['2026-10-02'] = { ts: 1, time: '19:00' }; // al final sí fue
  L.recomputeAwards(d);
  assert.equal(d.ledger.some((e) => e.key?.startsWith('skip:')), false);
  const p = doc([], { skips: { '2026-10-05': { reason: 'viaje', ts: 1 } }, pauses: [{ from: '2026-10-03', to: null }] });
  L.recomputeAwards(p);
  assert.equal(L.balance(p), 0);
});

test('suplementos: creatina y proteína por defecto, lista propia y semana', () => {
  const d = doc([]);
  assert.deepEqual(L.suppList(d).map((x) => x.id), ['creatina', 'proteina']);
  d.suppLog = { '2026-10-06': ['creatina', 'proteina'], '2026-10-05': ['creatina'] };
  const w = L.suppWeek(d, '2026-10-06');
  assert.equal(w.length, 7);
  assert.deepEqual([w[6].state, w[5].state, w[4].state], ['all', 'some', 'none']);
  d.supps = [{ id: 'm', name: 'Multi', emoji: '💊', when: 'daily' }];
  assert.equal(L.suppWeek(d, '2026-10-06')[6].state, 'none');
  d.supps = [];
  assert.equal(L.suppList(d).length, 0); // quitar todo se respeta
});
