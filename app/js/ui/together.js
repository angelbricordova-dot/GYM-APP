import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { accentVars } from '../theme.js';
import { Icon, Flame, Avatar, Segmented, Empty, toast, cx } from './kit.js';
import { ChallengesPanel } from './challenges.js';
import { Summary } from './progress.js';

/** Todo lo de a dos: retos del día, tablero de motivación y el perfil de mi pareja. */
export function Together() {
  const partner = S.state.partner;
  const [tab, setTab] = useState(() => (S.challengesForMe().length + S.challengesToReview().length > 0 ? 'challenges' : 'board'));
  const pending = S.challengesForMe().length + S.challengesToReview().length;
  const notes = S.unread();

  if (!partner) return html`<div class="view-in">
    <header class="top large"><h1>Juntos</h1></header>
    <section class="card center rise">
      <div class="empty-ic">💌</div>
      <h2>Aún no se une</h2>
      <p class="muted">Pásale este código para que cree su perfil. Cuando entre, podrán verse el progreso, retarse y mandarse notas.</p>
      <div class="invite-code">${(S.state.invite || '······').split('').map((c) => html`<span>${c}</span>`)}</div>
      <div class="row-btns">
        <button class="btn tinted" onClick=${() => { navigator.clipboard?.writeText(S.state.invite || ''); toast('Código copiado', { icon: '📋' }); }}><${Icon} name="copy" size=${16} /> Copiar</button>
        ${navigator.share && html`<button class="btn tinted" onClick=${() => navigator.share({ text: `Únete a nuestro Lindwyrm con el código ${S.state.invite}` }).catch(() => {})}><${Icon} name="send" size=${16} /> Compartir</button>`}
      </div>
    </section>
  </div>`;

  return html`<div class="view-in">
    <header class="top large"><div><h1>Juntos</h1></div><${Avatar} doc=${partner.doc || { name: partner.name }} size=${40} ring /></header>
    <${Segmented} value=${tab} onChange=${setTab} options=${[
      { id: 'challenges', label: 'Retos', badge: pending || null },
      { id: 'board', label: 'Motivación', badge: notes || null },
      { id: 'profile', label: partner.name.length > 9 ? 'Su perfil' : partner.name },
    ]} />
    ${tab === 'challenges' && html`<${ChallengesPanel} />`}
    ${tab === 'board' && html`<${Board} partner=${partner} />`}
    ${tab === 'profile' && html`<${PartnerProfile} partner=${partner} />`}
  </div>`;
}

// ============ tablero de motivación ============
function Board({ partner }) {
  const me = S.state.auth.uid;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const notes = S.state.messages.filter((m) => m.kind !== 'reaction').sort((a, b) => b.ts - a.ts);
  useEffect(() => { S.markSeen(); }, [S.state.messages.length]);

  const send = async (t) => {
    if (!t.trim() || busy) return;
    setBusy(true);
    const r = await S.sendMessage(t.trim(), 'text');
    setBusy(false);
    if (r.ok) { setText(''); toast(`Nota enviada a ${partner.name}`, { icon: '💌' }); } else toast(r.data.error, { icon: '⚠️' });
  };
  const random = () => setText(L.PHRASES[Math.floor(Math.random() * L.PHRASES.length)]);

  return html`<div class="stack-lg">
    <section class="card composer rise">
      <h2>Dile algo bonito a ${partner.name}</h2>
      <textarea rows="2" maxlength="280" placeholder="Escribe una nota de ánimo…" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
      <div class="chips">${L.PHRASES.slice(0, 6).map((p) => html`<button class="chip" onClick=${() => setText(p)}>${p}</button>`)}</div>
      <div class="cta-row">
        <button class="btn tinted" onClick=${random}><${Icon} name="sparkle" size=${16} /> Sorpréndeme</button>
        <button class="btn primary grow" disabled=${!text.trim() || busy} onClick=${() => send(text)}><${Icon} name="send" size=${16} /> Enviar nota</button>
      </div>
    </section>
    ${notes.length === 0
      ? html`<${Empty} icon="💞" title="El tablero está vacío" text="Aquí quedan las notas que se mandan. Empieza tú: una frase corta cambia el día." />`
      : html`<div class="wall">${notes.map((n) => html`<${Note} n=${n} mine=${n.from === me} partner=${partner} />`)}</div>`}
  </div>`;
}

function Note({ n, mine, partner }) {
  const me = S.state.auth.uid;
  const liked = (n.likes || []).includes(me);
  const color = mine ? S.state.me.color : partner.doc?.color || '#ff5c93';
  const when = new Date(n.ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return html`<article class=${cx('note', mine && 'mine')} style=${accentVars(color)}>
    <p>${n.text}</p>
    <footer>
      <small>${mine ? 'Tú' : partner.name} · ${when}</small>
      <span class="note-actions">
        ${mine && html`<button class="note-btn" onClick=${async () => { if (confirm('¿Borrar esta nota?')) await S.deleteMessage(n.id); }} aria-label="Borrar nota"><${Icon} name="trash" size=${15} /></button>`}
        <button class=${cx('note-btn heart-btn', liked && 'on')} onClick=${() => S.likeMessage(n.id)} aria-label=${liked ? 'Quitar corazón' : 'Dar corazón'} aria-pressed=${liked}>
          <${Icon} name="heart" size=${16} fill=${liked} />${(n.likes || []).length > 0 ? html`<b>${n.likes.length}</b>` : null}
        </button>
      </span>
    </footer>
  </article>`;
}

// ============ perfil de mi pareja ============
function PartnerProfile({ partner }) {
  const d = partner.doc;
  const me = S.state.me;
  if (!d) return html`<section class="card"><p class="muted">Cargando su perfil…</p></section>`;
  const info = L.streakInfo(d);
  const pair = L.pairWeekStreak(me, d);
  const todayCk = d.checkins[L.ymd()];
  return html`<div class="stack-lg" style=${accentVars(d.color)}>
    <section class="card hero rise">
      <div class="streak-row">
        <div class=${cx('flame-wrap', info.alive && 'alive', info.atRisk && 'risk')}><${Flame} size=${72} lit=${info.alive} /></div>
        <div class="streak-txt">
          <div class="streak-n"><b>${info.current}</b><span>${info.current === 1 ? 'día de racha' : 'días de racha'}</span></div>
          <p class=${cx('streak-sub', info.atRisk && 'warn')}>${todayCk ? '✅ Ya entrenó hoy' : info.atRisk ? '⚠️ Hoy es su último día de margen' : info.paused ? 'En pausa ⏸' : 'Aún no entrena hoy'}</p>
        </div>
      </div>
      <div class="pair-line"><span>🔥</span><div><b>${pair ? `Racha de pareja: ${pair} ${pair === 1 ? 'semana' : 'semanas'}` : 'Racha de pareja'}</b><small>${pair ? 'Semanas seguidas en que los dos cumplieron su meta' : 'Cumplan los dos su meta esta semana para empezarla'}</small></div></div>
    </section>
    <${Summary} doc=${d} isMe=${false} />
  </div>`;
}
