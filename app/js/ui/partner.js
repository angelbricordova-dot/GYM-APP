import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Flame, Avatar, toast, cx, fmtDay } from './kit.js';
import { Calendar, DaySheet } from './calendar.js';
import { StatGrid, Gallery } from './progress.js';

const QUICK = ['¡Vamos, tú puedes! 💪', '¡Hoy toca gym! 🏋️', 'Esa racha no se rompe 🔥', 'Mándame tu foto del espejo 📸', '¡Qué orgullo de ti! 🥹'];

/** El perfil de mi pareja: su racha, su calendario, sus fotos y un canal para animarla. */
export function Partner() {
  const { partner, me } = { partner: S.state.partner, me: S.state.me };
  const [day, setDay] = useState(null);
  useEffect(() => { S.markSeen(); }, [S.state.messages.length]);

  if (!partner) return html`<div class="view-in">
    <header class="top"><div><small class="muted">Tu pareja</small><h1>Pareja</h1></div></header>
    <section class="card center rise">
      <div class="empty-ic">💌</div>
      <h2>Aún no se une</h2>
      <p class="muted">Pásale este código para que cree su perfil y vean el progreso del otro.</p>
      <div class="invite-code">${(S.state.invite || '······').split('').map((c) => html`<span>${c}</span>`)}</div>
      <div class="row-btns">
        <button class="btn" onClick=${() => { navigator.clipboard?.writeText(S.state.invite || ''); toast('Código copiado', { icon: '📋' }); }}><${Icon} name="copy" size=${16} /> Copiar</button>
        ${navigator.share && html`<button class="btn" onClick=${() => navigator.share({ text: `Únete a nuestro Gym Duo con el código ${S.state.invite}` }).catch(() => {})}><${Icon} name="send" size=${16} /> Compartir</button>`}
      </div>
    </section>
  </div>`;

  const d = partner.doc;
  if (!d) return html`<div class="view-in"><header class="top"><div><small class="muted">Tu pareja</small><h1>${partner.name}</h1></div></header><section class="card"><p class="muted">Cargando su perfil…</p></section></div>`;
  const info = L.streakInfo(d);
  const pair = L.pairWeekStreak(me, d);
  const todayCk = d.checkins[L.ymd()];

  return html`<div class="view-in" style=${`--accent:${d.color}`}>
    <header class="top"><div><small class="muted">Su perfil</small><h1>${partner.name}</h1></div><${Avatar} doc=${d} size=${44} ring /></header>

    <section class="card hero rise partner-hero">
      <div class="streak-row">
        <div class=${cx('flame-wrap', info.alive && 'alive', info.atRisk && 'risk')}><${Flame} size=${72} lit=${info.alive} /></div>
        <div class="streak-txt">
          <div class="streak-n"><b>${info.current}</b><span>${info.current === 1 ? 'día de racha' : 'días de racha'}</span></div>
          <p class=${cx('streak-sub', info.atRisk && 'warn')}>${todayCk ? '✅ Ya entrenó hoy' : info.atRisk ? '⚠️ Hoy es su último día de margen' : info.paused ? 'En pausa ⏸' : 'Aún no entrena hoy'}</p>
        </div>
      </div>
      <div class="pair-line"><span>🔥</span><div><b>${pair ? `Racha de pareja: ${pair} ${pair === 1 ? 'semana' : 'semanas'}` : 'Racha de pareja'}</b><small>${pair ? 'Semanas seguidas en que los dos cumplieron su meta' : 'Cumplan los dos su meta esta semana para empezarla'}</small></div></div>
    </section>

    <section class="card rise" style="--i:1"><${Calendar} doc=${d} onDay=${setDay} /></section>
    <div class="rise" style="--i:2"><${StatGrid} doc=${d} /></div>
    <section class="card rise" style="--i:3"><h2>Sus fotos</h2><${Gallery} doc=${d} onDay=${setDay} /></section>
    <${Chat} partner=${partner} me=${me} />
    ${day && html`<${DaySheet} doc=${d} date=${day} isMe=${false} onClose=${() => setDay(null)} />`}
  </div>`;
}

function Chat({ partner, me }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef();
  const msgs = S.state.messages.filter((m) => m.kind !== 'reaction');
  const reacts = S.state.messages.filter((m) => m.kind === 'reaction' && m.from !== S.state.auth.uid);
  const uid = S.state.auth.uid;

  const send = async (t, kind = 'text') => {
    if (!t.trim() || busy) return;
    setBusy(true);
    const r = await S.sendMessage(t, kind);
    setBusy(false);
    if (r.ok) setText(''); else toast(r.data.error, { icon: '⚠️' });
  };

  return html`<section class="card rise chat" style="--i:4">
    <h2>Mensajes</h2>
    <div class="quick-chips">${QUICK.map((q) => html`<button class="chip pick" onClick=${() => send(q, 'cheer')}>${q}</button>`)}</div>
    <div class="thread">
      ${msgs.length === 0 && html`<p class="muted small center">Mándale algo bonito para empezar 💌</p>`}
      ${msgs.slice(-12).map((m) => html`<div class=${cx('bubble', m.from === uid ? 'mine' : 'theirs', m.kind === 'cheer' && 'cheer')}><span>${m.text}</span><small>${new Date(m.ts).toLocaleString('es-MX', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</small></div>`)}
      ${reacts.slice(-3).map((r) => html`<div class="react-note">${partner.name} reaccionó ${r.text} a tu entreno del ${r.ref?.date ? fmtDay(r.ref.date) : ''}</div>`)}
      <div ref=${end}></div>
    </div>
    <form class="inline" onSubmit=${(e) => { e.preventDefault(); send(text); }}>
      <input value=${text} onInput=${(e) => setText(e.target.value)} placeholder=${`Escríbele a ${partner.name}…`} maxlength="280" enterkeyhint="send" />
      <button class="btn primary sq" disabled=${!text.trim() || busy} aria-label="Enviar"><${Icon} name="send" size=${18} /></button>
    </form>
  </section>`;
}
