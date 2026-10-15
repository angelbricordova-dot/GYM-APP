import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm-quiz-'));
delete process.env.SETUP_CODE;
process.env.QUIZ_DAYS = '60';
const { default: api, runReminders, _push } = await import('../server/handler.mjs');
const Q = await import('../app/js/questions.js');

const sent = [];
_push.send = async (sub, payload) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); return { statusCode: 201 }; };
const call = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const day = (n = 0) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let A, B;

test('banco de preguntas: ids únicos, tipos válidos y suficientes picantes', () => {
  const ids = new Set(Q.QUESTIONS.map((q) => q.id));
  assert.equal(ids.size, Q.QUESTIONS.length);
  for (const q of Q.QUESTIONS) {
    assert.ok(Q.CATEGORIES[q.cat], q.id);
    assert.ok(['open', 'choice', 'scale'].includes(q.type), q.id);
    if (q.type === 'choice') assert.ok(q.options.length >= 2, q.id);
  }
  assert.ok(Q.QUESTIONS.filter((q) => q.cat === 'picante').length >= 25);
  assert.equal(Q.cleanAnswer({ type: 'scale' }, 9), null);
  assert.equal(Q.cleanAnswer({ type: 'choice', options: ['a', 'b'] }, 1), 1);
  assert.equal(Q.cleanAnswer({ type: 'open' }, '   '), null);
});

test('preparar', async () => {
  A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data;
  B = (await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: A.inviteCode, pact: 'acepto mi amor te amo mucho' } })).data;
  await call('POST', '/push/subscribe', { token: A.token, body: { subscription: { endpoint: 'https://push.example/A', keys: { p256dh: 'BPkA', auth: 'auA' } } } });
  await call('POST', '/push/subscribe', { token: B.token, body: { subscription: { endpoint: 'https://push.example/B', keys: { p256dh: 'BPkB', auth: 'auB' } } } });
});

test('la pregunta del día es la misma para los dos y las respuestas se ven hasta responder', async () => {
  assert.equal((await call('GET', '/quiz/today?date=2001-01-01', { token: A.token })).status, 400);
  assert.equal((await call('GET', '/quiz/today?date=hoy', { token: A.token })).status, 400);
  const a = (await call('GET', `/quiz/today?date=${day()}`, { token: A.token })).data;
  const b = (await call('GET', `/quiz/today?date=${day()}`, { token: B.token })).data;
  assert.equal(a.q.id, b.q.id);
  assert.deepEqual([a.me.answered, a.partner.answered, a.bothSpicy], [false, false, true]);
  const q = Q.questionById(a.q.id);
  const valid = q.type === 'open' ? 'Me encanta tu risa' : q.type === 'choice' ? 1 : 4;
  assert.equal((await call('POST', '/quiz/answer', { token: A.token, body: { date: day(), value: q.type === 'choice' ? 99 : q.type === 'scale' ? 0 : '' } })).status, 400);
  sent.length = 0;
  const ra = await call('POST', '/quiz/answer', { token: A.token, body: { date: day(), value: valid } });
  assert.equal(ra.status, 200);
  assert.equal(ra.data.me.answered, true);
  assert.match(sent.at(-1).title, /ya respondió/);
  assert.doesNotMatch(sent.at(-1).body, /encanta/); // la respuesta no sale en la notificación
  assert.equal((await call('POST', '/quiz/answer', { token: A.token, body: { date: day(), value: valid } })).status, 409);
  // ella aún no responde: ve que él respondió, pero no qué
  const peek = (await call('GET', `/quiz/today?date=${day()}`, { token: B.token })).data;
  assert.deepEqual([peek.partner.answered, peek.partner.value, peek.partner.text], [true, undefined, undefined]);
  // ella responde: se revelan las dos
  sent.length = 0;
  const rb = await call('POST', '/quiz/answer', { token: B.token, body: { date: day(), value: valid } });
  assert.equal(rb.data.partner.text, a.q.type === 'choice' ? q.options[1] : q.type === 'scale' ? '4/5' : 'Me encanta tu risa');
  assert.match(sent.at(-1).title, /ya respondieron/);
  const back = (await call('GET', `/quiz/today?date=${day()}`, { token: A.token })).data;
  assert.equal(back.partner.answered, true);
  assert.notEqual(back.partner.text, '');
});

test('“prefiero no responder” y el historial solo muestra lo que ya respondí', async () => {
  const a = (await call('GET', `/quiz/today?date=${day(1)}`, { token: A.token })).data;
  assert.notEqual(a.q.id, (await call('GET', `/quiz/today?date=${day()}`, { token: A.token })).data.q.id); // otro día, otra pregunta
  const sk = await call('POST', '/quiz/answer', { token: B.token, body: { date: day(1), skip: true } });
  assert.deepEqual([sk.data.me.answered, sk.data.me.skipped], [true, true]);
  const hist = (await call('GET', '/quiz/history', { token: B.token })).data.items;
  assert.equal(hist.length, 2);
  assert.equal((await call('GET', '/quiz/history', { token: A.token })).data.items.length, 1); // él no respondió la de mañana
});

test('preguntas picantes: si alguno las apaga, ese día pasan a ser de romance; se pueden volver a encender', async () => {
  // buscar un día cuya categoría sea picante
  let d = 2;
  const isPicante = (n) => Q.ROTATION[Math.floor(Date.parse(`${day(n)}T00:00:00Z`) / 864e5) % Q.ROTATION.length] === 'picante';
  while (!isPicante(d)) d++;
  assert.equal((await call('POST', '/quiz/settings', { token: B.token, body: { spicy: false } })).data.spicy, false);
  const off = (await call('GET', `/quiz/today?date=${day(d)}`, { token: A.token })).data;
  assert.equal(off.q.cat, 'romance');
  assert.equal(off.bothSpicy, false);
  await call('POST', '/quiz/settings', { token: B.token, body: { spicy: true } });
  let e = d + 1; while (!isPicante(e)) e++;
  assert.equal((await call('GET', `/quiz/today?date=${day(e)}`, { token: A.token })).data.q.cat, 'picante');
});

test('aviso de la tarde: solo si aún no respondió, una vez al día, sin el texto de la pregunta', async () => {
  sent.length = 0;
  const when = new Date(`${day(4)}T20:00:00Z`); // 20:00 UTC (zona por defecto UTC)
  const r = await runReminders(when);
  assert.equal(r.quiz, 2); // los dos sin responder ese día
  const titles = sent.filter((m) => /Pregunta del día/.test(m.title));
  assert.equal(titles.length, 2);
  assert.doesNotMatch(titles[0].body, /\?/);
  assert.equal((await runReminders(new Date(`${day(4)}T21:00:00Z`))).quiz, 0); // una sola vez
  // si ya respondió, no hay aviso
  const d5 = day(5);
  await call('GET', `/quiz/today?date=${d5}`, { token: A.token });
  await call('POST', '/quiz/answer', { token: A.token, body: { date: d5, skip: true } });
  sent.length = 0;
  const r2 = await runReminders(new Date(`${d5}T20:00:00Z`));
  assert.equal(r2.quiz, 1); // solo ella
  assert.equal(sent.filter((m) => /Pregunta del día/.test(m.title)).length, 1);
  assert.equal(sent.filter((m) => /Pregunta del día/.test(m.title))[0].endpoint, 'https://push.example/B');
});

test('recordar suplementos a mi pareja', async () => {
  sent.length = 0;
  const r = await call('POST', '/supps/remind', { token: A.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.missing, ['creatina', 'proteína']);
  const n = sent.find((m) => /te recuerda tus suplementos/.test(m.title));
  assert.equal(n.endpoint, 'https://push.example/B');
  assert.match(n.body, /creatina y proteína/);
  assert.equal((await call('POST', '/supps/remind', { token: A.token })).status, 429); // no atosigar
  // si ella ya marcó todo hoy, no hay nada que recordar
  const d = (await call('GET', '/sync', { token: B.token })).data.me;
  const today = new Date().toISOString().slice(0, 10);
  await call('PUT', '/me', { token: B.token, body: { doc: { ...d, tz: 'UTC', suppLog: { [today]: ['creatina', 'proteina'] }, updatedAt: d.updatedAt + 1 } } });
  const r2 = await call('POST', '/supps/remind', { token: B.token });
  assert.equal(r2.status, 200); // ella a él: él no ha marcado nada
  assert.equal((await call('POST', '/supps/remind', { token: A.token })).status, 409); // él a ella: ya marcó todo (o espera)
});
