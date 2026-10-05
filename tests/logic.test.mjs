import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/logic.js';

const doc = (days, extra = {}) => ({ ...L.newDoc('u', 'T'), checkins: Object.fromEntries(days.map((d) => [d, { ts: 1, time: '18:00' }])), ...extra });

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

test('tokens: gym + hitos + agua + récord, y se revierten al borrar', () => {
  const d = doc(['2026-10-01', '2026-10-02', '2026-10-03']);
  d.water['2026-10-01'] = 2000;
  d.sessions = [
    { id: 's1', date: '2026-10-01', time: '18:00', exercises: [{ name: 'Press banca', sets: [{ kg: 40, reps: 10 }] }] },
    { id: 's2', date: '2026-10-03', time: '18:00', exercises: [{ name: 'press BANCA', sets: [{ kg: 45, reps: 8 }] }] },
  ];
  L.recomputeAwards(d);
  // 3 días ×10 + hito de 3 días (10) + agua 5 + récord 5 + semana (3/3) 20
  assert.equal(L.balance(d), 30 + 10 + 5 + 5 + 20);
  L.recomputeAwards(d);
  assert.equal(L.balance(d), 70); // idempotente
  d.sessions.pop();
  L.recomputeAwards(d);
  assert.equal(L.balance(d), 65);
  d.ledger.push({ id: 'c', ts: 1, date: '2026-10-04', delta: -50, reason: 'Canje', ref: 'v1' });
  L.recomputeAwards(d);
  assert.equal(L.balance(d), 15); // los canjes se respetan
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
