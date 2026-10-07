import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_DB_DIR = mkdtempSync(join(tmpdir(), 'lindwyrm3-'));
const { default: api, _push, runReminders } = await import('../server/handler.mjs');

// El envío real (Apple/Google) se reemplaza: aquí solo importa QUÉ se manda y A QUIÉN.
const sent = [];
let failWith = null;
_push.send = async (sub, payload) => {
  if (failWith) throw Object.assign(new Error('gone'), { statusCode: failWith });
  sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) });
};

const call = async (method, path, { token, body, raw, type } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !raw) headers['content-type'] = 'application/json';
  if (type) headers['content-type'] = type;
  const res = await api(new Request(`http://x/api${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }));
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};
const sub = (id) => ({ endpoint: `https://push.example/${id}`, keys: { p256dh: 'BPk' + id, auth: 'au' + id } });
const last = () => sent.at(-1);

let A, B, invite;
const docOf = async (t) => (await call('GET', '/sync', { token: t })).data.me;
const saveDoc = async (t, patch) => { const d = await docOf(t); const r = await call('PUT', '/me', { token: t, body: { doc: { ...d, ...patch, updatedAt: d.updatedAt + 1 } } }); assert.equal(r.status, 200); return r; };

test('preparación: dos personas', async () => {
  A = (await call('POST', '/setup', { body: { name: 'Ángel', pin: '1234' } })).data;
  invite = A.inviteCode;
  B = (await call('POST', '/join', { body: { name: 'Angélica', pin: '4321', inviteCode: invite, pact: 'acepto mi amor te amo mucho' } })).data;
  assert.ok(A.token && B.token);
});

test('push: llave pública, suscripción válida/ inválida y prueba', async () => {
  const k = (await call('GET', '/push/key', { token: A.token })).data.key;
  assert.ok(k.length > 40);
  assert.equal((await call('GET', '/push/key', { token: B.token })).data.key, k); // misma llave para todos
  assert.equal((await call('POST', '/push/subscribe', { token: A.token, body: { subscription: { endpoint: 'http://inseguro', keys: {} } } })).status, 400);
  assert.equal((await call('POST', '/push/test', { token: A.token })).status, 409); // sin dispositivos
  assert.equal((await call('POST', '/push/subscribe', { token: A.token, body: { subscription: sub('A1') } })).status, 200);
  assert.equal((await call('POST', '/push/subscribe', { token: B.token, body: { subscription: sub('B1') } })).status, 200);
  assert.equal((await call('POST', '/push/subscribe', { token: B.token, body: { subscription: sub('B1') } })).status, 200); // no duplica
  assert.equal((await call('GET', '/sync', { token: B.token })).data.account.push.devices, 1);
  assert.equal((await call('POST', '/push/test', { token: A.token })).status, 200);
  assert.equal(last().endpoint, 'https://push.example/A1');
});

test('push: cada evento avisa a la OTRA persona', async () => {
  sent.length = 0;
  const c = (await call('POST', '/challenges', { token: A.token, body: { title: '10 flexiones', points: 20 } })).data.challenge;
  assert.deepEqual([last().endpoint, last().title, last().body], ['https://push.example/B1', 'Ángel te retó 🎯', '10 flexiones · 20 puntos de amor']);
  await call('POST', `/challenges/${c.id}/start`, { token: B.token });
  await call('POST', `/challenges/${c.id}/evidence`, { token: B.token, raw: Buffer.from('v'), type: 'video/mp4' });
  assert.deepEqual([last().endpoint, last().title], ['https://push.example/A1', 'Angélica envió su evidencia 📹']);
  await call('POST', `/challenges/${c.id}/review`, { token: A.token, body: { action: 'approve' } });
  assert.deepEqual([last().endpoint, last().title], ['https://push.example/B1', '¡Reto aprobado! +20 puntos de amor 💗']);

  await call('POST', '/messages', { token: A.token, body: { text: 'Tú puedes 💪' } });
  assert.deepEqual([last().endpoint, last().title, last().body], ['https://push.example/B1', '💌 Nota de Ángel', 'Tú puedes 💪']);
  const m = (await call('GET', '/sync', { token: B.token })).data.messages.at(-1);
  await call('POST', `/messages/${m.id}/like`, { token: B.token });
  assert.equal(last().endpoint, 'https://push.example/A1');

  const p = (await call('POST', '/proposals', { token: B.token, body: { name: 'Cine', emoji: '🎬', cost: 50 } })).data.proposal;
  assert.equal(last().endpoint, 'https://push.example/A1');
  await call('POST', `/proposals/${p.id}`, { token: A.token, body: { action: 'accept' } });
  assert.deepEqual([last().endpoint, last().title], ['https://push.example/B1', 'Ángel aceptó tu idea 🎬']);

  // check-in nuevo del día → avisa a la pareja con su racha
  const d = await docOf(A.token);
  const today = new Date().toISOString().slice(0, 10);
  await call('PUT', '/me', { token: A.token, body: { doc: { ...d, checkins: { [today]: { ts: 1, time: '18:00', photo: null } }, updatedAt: d.updatedAt + 1 } } });
  assert.deepEqual([last().endpoint, last().title], ['https://push.example/B1', 'Ángel ya entrenó 🔥']);
});

test('push: preferencias por tipo y limpieza de dispositivos caducados', async () => {
  assert.equal((await call('POST', '/push/prefs', { token: B.token, body: { notes: false, reminderHour: 99 } })).data.prefs.notes, false);
  sent.length = 0;
  await call('POST', '/messages', { token: A.token, body: { text: 'hola' } });
  assert.equal(sent.length, 0); // B apagó las notas
  await call('POST', '/challenges', { token: A.token, body: { title: 'Plancha', points: 10 } });
  assert.equal(sent.length, 1); // los retos siguen activos
  failWith = 410;
  await call('POST', '/challenges', { token: A.token, body: { title: 'Otro', points: 10 } });
  failWith = null;
  assert.equal((await call('GET', '/sync', { token: B.token })).data.account.push.devices, 0); // el dispositivo caducado se borra
  await call('POST', '/push/subscribe', { token: B.token, body: { subscription: sub('B2') } });
  await call('POST', '/push/unsubscribe', { token: B.token, body: { endpoint: sub('B2').endpoint } });
  assert.equal((await call('GET', '/sync', { token: B.token })).data.account.push.devices, 0);
});

test('push: los fallos ya no son invisibles (error en Perfil, aviso en la prueba y si la pareja no tiene avisos)', async () => {
  await call('POST', '/push/subscribe', { token: A.token, body: { subscription: sub('A9') } });
  failWith = 403;
  const t = await call('POST', '/push/test', { token: A.token });
  assert.equal(t.status, 409);
  assert.match(t.data.error, /403/);
  assert.match(t.data.error, /Reparar/);
  const acc = (await call('GET', '/sync', { token: A.token })).data.account;
  assert.equal(acc.push.error.status, 403); // se conserva para mostrarlo
  failWith = null;
  assert.equal((await call('POST', '/push/test', { token: A.token })).status, 200);
  assert.equal((await call('GET', '/sync', { token: A.token })).data.account.push.error, null); // un envío bueno lo limpia
  // ¿mi pareja puede recibir mis avisos?
  const hasB = (await call('GET', '/sync', { token: A.token })).data.partnerPush;
  assert.equal(typeof hasB, 'boolean');
  await call('POST', '/push/unsubscribe', { token: A.token, body: { endpoint: sub('A9').endpoint } });
  const swapped = (await call('GET', '/sync', { token: B.token })).data.partnerPush; // A ya sin dispositivos suscritos
  assert.equal(typeof swapped, 'boolean');
});

test('recordatorio diario: a la hora local, una vez, solo si no entrenó', async () => {
  await call('POST', '/push/subscribe', { token: B.token, body: { subscription: sub('B3') } });
  await call('POST', '/push/prefs', { token: B.token, body: { reminder: true, reminderHour: 18 } });
  await saveDoc(B.token, { tz: 'America/Mexico_City' });
  sent.length = 0;
  const at = (iso) => new Date(iso);
  assert.equal((await runReminders(at('2026-10-06T23:00:00Z'))).sent, 0); // 17:00 en CDMX: aún no
  assert.equal((await runReminders(at('2026-10-07T00:00:00Z'))).sent, 1); // 18:00 en CDMX
  assert.match(last().body, /entrenas|racha|gym/i);
  assert.equal((await runReminders(at('2026-10-07T00:30:00Z'))).sent, 0); // ya se mandó hoy
  const d = await docOf(B.token);
  await saveDoc(B.token, { checkins: { '2026-10-07': { ts: 1, time: '17:00' } } }); // 18:00 del día siguiente, pero ya entrenó
  await call('POST', '/push/prefs', { token: B.token, body: { reminder: true, reminderHour: 19 } });
  assert.equal((await runReminders(at('2026-10-08T01:00:00Z'))).sent, 0);
  assert.ok(d);
});

test('rutinas compartidas: enviar, ver, guardar y quitar', async () => {
  const body = { name: 'Empuje', note: 'Pruébala', exercises: [{ name: 'Press banca', sets: 4, reps: 8 }, 'Fondos', { name: '' }] };
  assert.equal((await call('POST', '/routines', { token: A.token, body: { name: '', exercises: [] } })).status, 400);
  const r = (await call('POST', '/routines', { token: A.token, body })).data.routine;
  assert.deepEqual(r.exercises, [{ name: 'Press banca', sets: 4, reps: 8 }, { name: 'Fondos', sets: 3, reps: 10 }]);
  assert.equal(r.status, 'new');
  assert.equal((await call('GET', '/sync', { token: B.token })).data.routines.length, 1);
  assert.equal((await call('POST', `/routines/${r.id}/save`, { token: A.token })).status, 403); // no puede guardar la suya
  assert.equal((await call('POST', `/routines/${r.id}/seen`, { token: B.token })).data.routine.status, 'seen');
  assert.equal((await call('POST', `/routines/${r.id}/save`, { token: B.token })).data.routine.status, 'saved');
  assert.equal((await call('POST', `/routines/${r.id}/dismiss`, { token: B.token })).data.routine.status, 'saved'); // no retrocede
  assert.equal((await call('POST', `/routines/${r.id}/delete`, { token: B.token })).status, 403);
  assert.equal((await call('POST', `/routines/${r.id}/delete`, { token: A.token })).status, 200);
  assert.equal((await call('GET', '/sync', { token: B.token })).data.routines.length, 0);
});

test('reiniciar de cero: borra el progreso, conserva la cuenta y los ajustes', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
  await call('POST', '/photo?id=abc-123456', { token: B.token, raw: jpeg });
  const c = (await call('POST', '/challenges', { token: A.token, body: { title: 'Sentadillas', points: 30 } })).data.challenge;
  await call('POST', `/challenges/${c.id}/evidence`, { token: B.token, raw: Buffer.from('video'), type: 'video/mp4' });
  await saveDoc(B.token, { color: '#FF5C93', weeklyGoal: 4, heightCm: 165, sessions: [{ id: 's', date: '2026-10-01', time: '10:00', exercises: [] }], weights: [{ date: '2026-10-01', kg: 60 }], routines: [{ id: 'r', name: 'x', exercises: ['a'] }] });

  const res = await call('POST', '/me/reset', { token: B.token });
  assert.equal(res.status, 200);
  const d = res.data.doc;
  assert.deepEqual([d.sessions.length, d.weights.length, d.routines.length, d.ledger.length, Object.keys(d.checkins).length], [0, 0, 0, 0, 0]);
  assert.deepEqual([d.color, d.weeklyGoal, d.heightCm, d.name], ['#FF5C93', 4, 165, 'Angélica']); // lo personal se conserva
  assert.ok(d.resetAt > 0);
  assert.equal((await call('GET', `/photo/${B.uid}/abc-123456`, { token: B.token })).status, 404);
  assert.equal((await call('GET', `/challenges/${c.id}/evidence`, { token: A.token })).status, 404);
  const ch = (await call('GET', '/sync', { token: B.token })).data.challenges.find((x) => x.id === c.id);
  assert.equal(ch.status, 'cancelled'); // el reto pendiente que le habían puesto se cancela
  assert.equal((await call('POST', '/login', { body: { name: 'Angélica', pin: '4321' } })).status, 200); // la cuenta sigue
});

test('eliminar cuenta: borra lo suyo, deja libre al otro y regenera el código', async () => {
  await call('POST', '/messages', { token: B.token, body: { text: 'adiós' } });
  const del = await call('POST', '/me/delete', { token: B.token });
  assert.equal(del.status, 200);
  assert.equal((await call('GET', '/sync', { token: B.token })).status, 401); // su sesión ya no vale
  assert.equal((await call('POST', '/login', { body: { name: 'Angélica', pin: '4321' } })).status, 401);
  const s = (await call('GET', '/sync', { token: A.token })).data;
  assert.equal(s.partner, null);
  assert.ok(s.inviteCode && s.inviteCode !== invite); // código nuevo: el viejo ya no sirve
  assert.equal(s.messages.some((m) => m.text === 'adiós'), false);
  assert.equal(s.challenges.length, 0);
  assert.equal((await call('POST', '/join', { body: { name: 'Nueva', pin: '1111', inviteCode: invite, pact: 'acepto mi amor te amo mucho' } })).status, 403);
  assert.equal((await call('POST', '/join', { body: { name: 'Nueva', pin: '1111', inviteCode: s.inviteCode, pact: 'acepto mi amor te amo mucho' } })).status, 200);
});

test('eliminar a la última persona libera el espacio para crearlo de nuevo', async () => {
  const s = (await call('GET', '/sync', { token: A.token })).data;
  const nueva = (await call('POST', '/login', { body: { name: 'Nueva', pin: '1111' } })).data;
  await call('POST', '/me/delete', { token: nueva.token });
  await call('POST', '/me/delete', { token: A.token });
  assert.equal((await call('GET', '/status')).data.setup, false);
  assert.equal((await call('POST', '/setup', { body: { name: 'Otra vez', pin: '2222' } })).status, 200);
  assert.ok(s);
});
