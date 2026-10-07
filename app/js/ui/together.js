import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { accentVars, haptic, playLike } from '../theme.js';
import { Icon, Flame, Avatar, Segmented, Empty, Sheet, toast, cx } from './kit.js';
import { ChallengesPanel, NewChallengeSheet } from './challenges.js';
import { RoutinesPanel } from './routines.js';
import { SuppPanel } from './supplements.js';
import { PenaltyForm } from './skip.js';
import { JoinOtherSheet } from './link.js';
import { shareInvite, copyInvite } from '../invite.js';
import { openScreen, closeScreen } from './nav.js';
import { Summary, PhotoStrip, Gallery } from './progress.js';
import { DaySheet } from './calendar.js';

/** Todo lo de a dos: retos del día, tablero de motivación y rutinas recomendadas. El perfil de mi pareja se abre desde su foto. */
export function Together() {
  const partner = S.state.partner;
  const [other, setOther] = useState(() => !!S.state.pendingInvite);
  const [tab, setTab] = useState(() => (S.challengesForMe().length + S.challengesToReview().length > 0 ? 'challenges' : 'board'));
  const pending = S.challengesForMe().length + S.challengesToReview().length;
  const notes = S.unread();
  const routines = S.routinesNew().length;

  if (!partner) return html`<div class="view-in">
    <header class="top large"><h1>Juntos</h1></header>
    <section class="card center rise">
      <div class="empty-ic">💌</div>
      <h2>Aún no se une</h2>
      <p class="muted">Mándale el enlace: se abre la pantalla “Únete” con el código ya escrito y ella o él solo tiene que aceptar. Cuando entre, podrán verse el progreso, retarse y mandarse notas.</p>
      <div class="invite-code">${(S.state.invite || '······').split('').map((c) => html`<span>${c}</span>`)}</div>
      <div class="row-btns">
        <button class="btn primary" onClick=${() => shareInvite(S.state.invite, S.state.me?.name)}><${Icon} name="send" size=${16} /> Compartir enlace</button>
        <button class="btn tinted" onClick=${() => copyInvite(S.state.invite)}><${Icon} name="copy" size=${16} /> Copiar</button>
      </div>
      <button class="link muted" onClick=${() => setOther(true)}>Tengo el código de otra persona</button>
    </section>
    ${other && html`<${JoinOtherSheet} onClose=${() => { setOther(false); S.setPendingInvite(null); }} />`}
  </div>`;

  return html`<div class="view-in">
    <header class="top large"><div><h1>Juntos</h1></div></header>
    <button class="profile-link" onClick=${() => openScreen('partner')}>
      <${Avatar} doc=${partner.doc || { name: partner.name }} size=${46} ring />
      <span class="grow"><b>Ver el perfil de ${partner.name}</b><small class="muted">Su racha, sus fotos y su progreso</small></span>
      <${Icon} name="right" size=${16} class="chev" />
    </button>
    <${Segmented} value=${tab} onChange=${setTab} options=${[
      { id: 'challenges', label: 'Retos', badge: pending || null },
      { id: 'board', label: 'Motivación', badge: notes || null },
      { id: 'routines', label: 'Rutinas', badge: routines || null },
      { id: 'supps', label: 'Suplementos' },
    ]} />
    ${tab === 'challenges' && html`<${ChallengesPanel} />`}
    ${tab === 'board' && html`<${Board} partner=${partner} />`}
    ${tab === 'routines' && html`<${RoutinesPanel} />`}
    ${tab === 'supps' && html`<${SuppPanel} />`}
  </div>`;
}

// ============ tablero de motivación ============
function Board({ partner }) {
  const me = S.state.auth.uid;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('all'); // all | fav
  const allNotes = S.state.messages.filter((m) => m.kind !== 'reaction' && m.kind !== 'skip').sort((a, b) => b.ts - a.ts); // las razones de “hoy no fui” no van al tablero
  const favs = allNotes.filter((n) => (n.starred || []).includes(me));
  const notes = view === 'fav' ? favs : allNotes;
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
    ${allNotes.length > 0 && html`<div class="chips"><button class=${cx('chip pick', view === 'all' && 'on')} onClick=${() => setView('all')}>Todas · ${allNotes.length}</button><button class=${cx('chip pick', view === 'fav' && 'on')} onClick=${() => setView('fav')}>⭐ Favoritas · ${favs.length}</button></div>`}
    ${notes.length === 0
      ? html`<${Empty} icon=${view === 'fav' ? '⭐' : '💞'} title=${view === 'fav' ? 'Aún no tienes favoritas' : 'El tablero está vacío'} text=${view === 'fav' ? 'Toca la estrella de una nota para guardarla aquí. Las favoritas no se borran con “Borrar historial”.' : 'Aquí quedan las notas que se mandan. Empieza tú: una frase corta cambia el día.'} />`
      : html`<div class="wall">${notes.map((n) => html`<${Note} n=${n} mine=${n.from === me} partner=${partner} />`)}</div>`}
  </div>`;
}

function Note({ n, mine, partner }) {
  const me = S.state.auth.uid;
  const liked = (n.likes || []).includes(me);
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const starred = (n.starred || []).includes(me);
  const star = () => { haptic(8); S.starMessage(n.id); };
  const like = () => { if (!liked) { setBurst((b) => b + 1); haptic([12, 40, 18]); playLike(); } S.likeMessage(n.id); };
  // doble toque sobre la nota = corazón (si aún no lo tiene)
  const tap = (e) => { if (e.target.closest('button')) return; const t = Date.now(); if (t - lastTap.current < 320 && !liked) like(); lastTap.current = t; };
  const color = mine ? S.state.me.color : partner.doc?.color || '#ff5c93';
  const when = new Date(n.ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const EMOJI = ['❤', '💗', '💕', '✨'];
  return html`<article class=${cx('note', mine && 'mine', n.kind === 'skip' && 'skip', burst > 0 && 'bump')} key=${`n${n.id}-${burst}`} style=${accentVars(color)} onClick=${tap}>
    ${burst > 0 && html`<span class="like-burst" key=${burst} aria-hidden="true"><i class="like-ring"></i>${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.2, d = 46 + (i % 3) * 22;
      return html`<i class="lb" style=${`--x:${(Math.cos(a) * d).toFixed(1)}px;--y:${(Math.sin(a) * d - 30).toFixed(1)}px;--r:${(i % 2 ? 1 : -1) * (20 + (i * 17) % 50)}deg;--s:${(0.8 + (i % 4) * 0.22).toFixed(2)};--dl:${(i % 6) * 55}ms`}>${EMOJI[i % EMOJI.length]}</i>`;
    })}</span>`}
    ${n.kind === 'skip' && html`<span class="skip-tag">😔 ${mine ? 'Hoy no fui al gym' : 'Hoy no fue al gym'}</span>`}
    <p>${n.text}</p>
    ${n.kind === 'skip' && (n.penalty
      ? html`<p class="skip-pen">−${n.penalty.points} puntos de amor</p>`
      : mine ? html`<p class="muted small">Esperando a que ${partner.name} decida cuántos puntos te quita.</p>` : html`<${PenaltyForm} m=${n} name=${partner.name} />`)}
    <footer>
      <small>${mine ? 'Tú' : partner.name} · ${when}</small>
      <span class="note-actions">
        ${mine && html`<button class="note-btn" onClick=${async () => { if (confirm('¿Borrar esta nota?')) await S.deleteMessage(n.id); }} aria-label="Borrar nota"><${Icon} name="trash" size=${15} /></button>`}
        <button class=${cx('note-btn star-btn', starred && 'on')} onClick=${star} aria-label=${starred ? 'Quitar de favoritas' : 'Guardar en favoritas'} aria-pressed=${starred}><span class=${cx('heart-ic', starred && 'pop')} key=${starred ? 'son' : 'soff'}><${Icon} name="star" size=${18} fill=${starred} /></span></button>
        <button class=${cx('note-btn heart-btn', liked && 'on')} onClick=${like} aria-label=${liked ? 'Quitar corazón' : 'Dar corazón'} aria-pressed=${liked}>
          <span class=${cx('heart-ic', liked && 'pop')} key=${liked ? 'on' : 'off'}><${Icon} name="heart" size=${18} fill=${liked} /></span>${(n.likes || []).length > 0 ? html`<b>${n.likes.length}</b>` : null}
        </button>
      </span>
    </footer>
  </article>`;
}

// ============ perfil de mi pareja (pantalla completa) ============
// Se ve distinto a mi propio perfil a propósito: banda con SU color, “Perfil de …” arriba y la etiqueta de solo lectura.
export function PartnerScreen() {
  const partner = S.state.partner;
  if (!partner) return null;
  const d = partner.doc;
  return html`<div class="screen profile partner-view" style=${accentVars(d?.color || '#ff5c93')}>
    <div class="screen-top"><button class="icon-btn" onClick=${closeScreen} aria-label="Volver"><${Icon} name="left" size=${20} /></button><b>Perfil de ${partner.name}</b><span class="ro-pill" title="Solo lectura"><${Icon} name="eye" size=${14} /></span></div>
    <div class="screen-body"><${PartnerProfile} partner=${partner} /></div>
  </div>`;
}

function PartnerProfile({ partner }) {
  const d = partner.doc;
  const [day, setDay] = useState(null);
  const [all, setAll] = useState(false);
  const [challenge, setChallenge] = useState(false);
  if (!d) return html`<section class="card"><p class="muted">Cargando su perfil…</p></section>`;
  const info = L.streakInfo(d);
  const pair = L.pairWeekStreak(S.state.me, d);
  const todayCk = d.checkins[L.ymd()];
  const photos = Object.values(d.checkins).filter((c) => c.photo).length;
  const cheer = async () => { const r = await S.sendMessage(L.PHRASES[Math.floor(Math.random() * L.PHRASES.length)], 'cheer'); toast(r.ok ? `Nota enviada a ${partner.name}` : r.data.error, { icon: r.ok ? '💌' : '⚠️' }); };
  return html`<div class="stack-lg">
    <section class="pv-hero rise">
      <div class="pv-cover"></div>
      <div class="pv-card">
        <div class="pv-avatar"><${Avatar} doc=${d} size=${92} ring /></div>
        <span class="pv-badge"><${Icon} name="eye" size=${14} /> Estás viendo el perfil de ${partner.name}</span>
        <h1>${partner.name}</h1>
        <div class="pv-stats">
          <div><${Flame} size=${22} lit=${info.alive} /><b>${info.current}</b><small>racha</small></div>
          <div><b>${info.total}</b><small>días de gym</small></div>
          <div><b>${photos}</b><small>fotos</small></div>
        </div>
        <p class=${cx('streak-sub', info.atRisk && 'warn')}>${todayCk ? '✅ Ya entrenó hoy' : info.atRisk ? '⚠️ Hoy es su último día de margen' : info.paused ? 'En pausa ⏸' : 'Aún no entrena hoy'}</p>
        <div class="pv-actions">
          <button class="btn primary sm" onClick=${() => setAll(true)} disabled=${!photos}><${Icon} name="camera" size=${16} /> Sus fotos</button>
          <button class="btn tinted sm" onClick=${cheer}><${Icon} name="heart" size=${16} /> Ánimo</button>
          <button class="btn tinted sm" onClick=${() => setChallenge(true)}><${Icon} name="target" size=${16} /> Retar</button>
        </div>
      </div>
    </section>
    <${PhotoStrip} doc=${d} onDay=${setDay} onAll=${() => setAll(true)} />
    <section class="card rise pv-pair"><div class="pair-line"><span>🔥</span><div><b>${pair ? `Racha de pareja: ${pair} ${pair === 1 ? 'semana' : 'semanas'}` : 'Racha de pareja'}</b><small>${pair ? 'Semanas seguidas en que los dos cumplieron su meta' : 'Cumplan los dos su meta esta semana para empezarla'}</small></div></div></section>
    <${Summary} doc=${d} isMe=${false} hidePhotos />
    ${day && html`<${DaySheet} doc=${d} date=${day} isMe=${false} onClose=${() => setDay(null)} />`}
    ${all && html`<${Sheet} title=${`Todas las fotos de ${partner.name}`} full onClose=${() => setAll(false)}><${Gallery} doc=${d} onDay=${(x) => { setAll(false); setDay(x); }} limit=${Infinity} /><//>`}
    ${challenge && html`<${NewChallengeSheet} onClose=${() => setChallenge(false)} />`}
  </div>`;
}
