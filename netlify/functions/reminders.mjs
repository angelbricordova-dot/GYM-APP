// Se ejecuta cada hora (función programada de Netlify, solo en producción) y manda el recordatorio de gym
// a quien lo activó, a la hora local que eligió y solo si aún no entrenó ese día.
import { runReminders } from '../../server/handler.mjs';

export default async () => {
  const r = await runReminders();
  console.log('recordatorios enviados:', r.sent);
};

export const config = { schedule: '0 * * * *' };
