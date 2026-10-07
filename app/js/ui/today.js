import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Flame, Avatar, Heart, Points, CountUp, puntos, toast, cx, fmtKg, fmtShort, fmtDur } from './kit.js';
import { openScreen, goTab } from './nav.js';
import { beginWorkout } from './workout.js';
import { ChallengeCard, NewChallengeSheet } from './challenges.js';
import { shareInvite, copyInvite } from '../invite.js';
import { SkipSheet, SkipDecision } from './skip.js';
import { JoinOtherSheet } from './link.js';
import { pushSupport, enablePush } from '../push.js';

export function Today() {
  const [skip, setSkip] = useState(false);
  const me = S.state.me;
  const partner = S.state.partner;
  const info = L.streakInfo(me);
  const bal = L.balance(me);
  const forMe = [...S.challengesForMe(), ...S.challengesWaiting()];
  const review = S.challengesToReview();

  return html`<div class="view-in">
    <${Header} me=${me} />
    <${Banners} />
    ${S.skipsToDecide().map((m) => html`<${SkipDecision} key=${m.id} m=${m} />`)}
    <${WorkoutHero} me=${me} />

    ${(forMe.length > 0 || review.length > 0) && html`<section class="rise" style="--i:1">
      <h3 class="sec-h">Retos de hoy</h3>
      ${review.map((c) => html`<${ChallengeCard} key=${c.id} c=${c} />`)}
      ${forMe.map((c) => html`<${ChallengeCard} key=${c.id} c=${c} />`)}
    </section>`}

    <section class="card streak-card rise" style="--i:2">
      <div class="streak-row">
        <div class=${cx('flame-wrap', info.alive && 'alive', info.atRisk && 'risk')}><${Flame} size=${64} lit=${info.alive} /></div>
        <div class="streak-txt">
          <div class="streak-n"><b><${CountUp} value=${info.current} /></b><span>${info.current === 1 ? 'día de racha' : 'días de racha'}</span></div>
          <p class=${cx('streak-sub', info.atRisk && 'warn')}>${streakText(info)}</p>
        </div>
      </div>
      <div class="week">${L.weekDots(me).map((d) => html`<div class=${cx('wd', d.done && 'done', d.today && 'today', d.future && 'future')}><span>${d.label}</span><i>${d.done ? html`<${Icon} name="check" size=${14} sw=${3.2} />` : ''}</i></div>`)}</div>
      ${info.paused
        ? html`<button class="btn tinted block" onClick=${() => S.endPause()}>Terminar pausa de racha</button>`
        : !me.checkins[L.ymd()] && html`<button class="btn tinted block" onClick=${() => openScreen('checkin')}><${Icon} name="camera" size=${18} /> Ya entrené: tomar mi foto</button>`}
      ${me.checkins[L.ymd()] && html`<p class="muted small center done-line">✅ Hoy ya cuenta · ${me.checkins[L.ymd()].time} h${me.checkins[L.ymd()].photo ? '' : ' · sin foto'}</p>`}
      ${L.skipToday(me) && !me.checkins[L.ymd()] && html`<${SkipStatus} skip=${L.skipToday(me)} />`}
      ${!me.checkins[L.ymd()] && !L.skipToday(me) && !info.paused && html`<button class="btn bad block" onClick=${() => setSkip(true)}><${Icon} name="x" size=${18} sw=${2.8} /> Hoy no fui al gym</button>`}
    </section>

    <${PartnerCard} partner=${partner} />

    <button class=${cx('card points-card rise', bal < 0 && 'in-debt')} style="--i:4" onClick=${() => goTab('rewards')}>
      <span class="points-ic"><${Heart} size=${26} /></span>
      <div class="grow">
        ${bal < 0
          ? html`<small class="debt-line"><span class="debt-badge">Deuda</span> Tienes una deuda de ${puntos(-bal)}</small>`
          : html`<small class="muted">Puntos de amor</small>`}
        <b class=${cx('points-n', bal < 0 && 'neg')}><${CountUp} value=${bal} /></b>
      </div>
      <small class="muted next-txt">${bal < 0 ? 'Se paga con tus próximos puntos' : nextReward(bal)}</small>
      <${Icon} name="right" size=${16} class="chev" />
    </button>

    <${Goals} me=${me} />
    ${skip && html`<${SkipSheet} onClose=${() => setSkip(false)} />`}
  </div>`;
}

function SkipStatus({ skip }) {
  const pts = S.skipPenalties()[L.ymd()];
  const name = S.state.partner?.name || 'tu pareja';
  const cap = name[0].toUpperCase() + name.slice(1);
  const txt = pts === undefined ? `Esperando a que ${name} decida cuántos puntos te quita.` : pts === 0 ? `${cap} decidió no quitarte ningún punto 💗` : `${cap} te quitó ${pts} puntos de amor. Entrenar hoy los devuelve.`;
  const key = `status:${L.ymd()}:${pts}`;
  if (S.isDismissed(key)) return null;
  return html`<div class="skip-status"><button class="icon-btn flat skip-x" onClick=${() => S.dismiss(key)} aria-label="Cerrar este aviso"><${Icon} name="x" size=${16} /></button><b>😔 Hoy no fui</b><small>“${skip.reason}”</small><span>${txt}</span></div>`;
}

function Header({ me }) {
  const h = new Date().getHours();
  const hi = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return html`<header class="top large">
    <div><small class="muted">${hi}</small><h1>${me.name}</h1></div>
    <button class="avatar-btn" onClick=${() => openScreen('profile')} aria-label="Mi perfil"><${Avatar} doc=${me} size=${44} ring /></button>
  </header>`;
}

/** El botón más importante de la app: empezar a entrenar, con la mínima fricción. */
function WorkoutHero({ me }) {
  const draft = S.state.draft;
  const last = [...me.sessions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  const todayCk = me.checkins[L.ymd()];
  if (draft) {
    return html`<button class="workout-hero live rise" onClick=${() => openScreen('workout')}>
      <span class="wh-eyebrow"><i class="live-dot"></i> Entreno en curso</span>
      <b>Continuar entreno</b>
      <small>${draft.exercises.length} ${draft.exercises.length === 1 ? 'ejercicio' : 'ejercicios'} · ${fmtDur(Math.floor((Date.now() - draft.startedAt) / 1000))}</small>
      <span class="wh-go"><${Icon} name="play" size=${22} fill /></span>
    </button>`;
  }
  return html`<div class="rise">
    <button class="workout-hero" onClick=${() => beginWorkout([])}>
      <span class="wh-eyebrow">${todayCk ? 'Hoy ya cuenta ✓' : 'Hoy'}</span>
      <b>Empezar entreno</b>
      <small>${last ? `Último: ${last.exercises.map((e) => e.name).slice(0, 2).join(', ')}` : 'Tu primer entreno te espera'}</small>
      <span class="wh-go"><${Icon} name="play" size=${22} fill /></span>
    </button>
    ${(me.routines.length > 0 || last) && html`<div class="chips quick-start">
      ${last && html`<button class="chip" onClick=${() => beginWorkout(last.exercises.map((e) => e.name))}><${Icon} name="repeat" size=${14} /> Repetir el último</button>`}
      ${me.routines.slice(0, 4).map((r) => html`<button class="chip" onClick=${() => beginWorkout(L.routineItems(r))}>${r.name}</button>`)}
    </div>`}
  </div>`;
}

function streakText(info) {
  if (info.paused) return 'Racha en pausa ⏸ — descansa tranquilo.';
  if (info.doneToday) return `¡Hoy cumpliste! Mejor racha: ${info.longest}.`;
  if (info.atRisk) return '¡Hoy es tu último día para mantenerla!';
  if (info.alive) return info.daysLeft === 1 ? 'Tienes 1 día más de margen.' : `Tienes ${info.daysLeft} días de margen.`;
  if (info.total > 0) return `Se reinició, pero tu mejor fue ${info.longest}. Empieza una nueva hoy.`;
  return 'Entrena y tómate la foto del espejo para encenderla.';
}

const nextReward = (bal) => {
  const next = S.state.proposals.filter((p) => p.status === 'accepted').sort((a, b) => a.cost - b.cost).find((p) => p.cost > bal);
  return next ? `Faltan ${next.cost - bal} para ${next.emoji}` : '';
};

/** Avisos importantes: notas nuevas, ideas por decidir, instalación en iPhone. */
function Banners() {
  const notes = S.state.messages.filter((m) => m.from !== S.state.auth.uid && m.kind !== 'reaction' && m.kind !== 'skip' && m.ts > S.state.seenAt);
  const pending = S.ideasForMe().length;
  const newRoutines = S.routinesNew();
  const toFulfill = S.vouchersToFulfill().filter((v) => v.status === 'open');
  const toConfirm = S.vouchersToConfirm();
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
  const [hideIos, setHideIos] = useState(() => { try { return !!localStorage.getItem('lindwyrm.iosTip'); } catch { return false; } });
  const sup = pushSupport();
  const devices = S.state.account?.push?.devices;
  const askPush = sup.supported && !sup.needsInstall && sup.permission === 'default' && devices === 0 && !S.isDismissed('push-ask');
  const [pushBusy, setPushBusy] = useState(false);
  const turnOn = async () => {
    setPushBusy(true);
    const r = await enablePush();
    setPushBusy(false);
    toast(r.ok ? 'Notificaciones activadas' : r.error, { icon: r.ok ? '🔔' : '⚠️' });
  };
  if (!notes.length && !pending && !newRoutines.length && !toFulfill.length && !toConfirm.length && (!ios || hideIos) && !askPush) return null;
  return html`<div class="group banners rise">
    ${askPush && html`<div class="row" role="button" onClick=${turnOn}><span class="lead tint-rose">🔔</span><div class="grow"><b>${pushBusy ? 'Activando…' : 'Activa las notificaciones'}</b><small class="muted">Para enterarte al instante de las notas, retos y premios de tu pareja</small></div><button class="icon-btn flat" onClick=${(e) => { e.stopPropagation(); S.dismiss('push-ask'); }} aria-label="Ahora no"><${Icon} name="x" size=${16} /></button></div>`}
    ${toConfirm.length > 0 && html`<div class="row" role="button" onClick=${() => goTab('rewards')}><span class="lead tint-rose">🙋</span><div class="grow"><b>${S.state.partner?.name} dice que ya cumplió ${toConfirm[0].emoji} ${toConfirm[0].name}</b><small class="muted">Confirma si es verdad</small></div><${Icon} name="right" size=${16} class="chev" /></div>`}
    ${toFulfill.length > 0 && html`<div class="row" role="button" onClick=${() => goTab('rewards')}><span class="lead tint-rose">🎁</span><div class="grow"><b>${toFulfill.length === 1 ? 'Tienes 1 premio por cumplir' : `Tienes ${toFulfill.length} premios por cumplir`}</b><small class="muted">${S.state.partner?.name} canjeó ${toFulfill[0].emoji} ${toFulfill[0].name}</small></div><${Icon} name="right" size=${16} class="chev" /></div>`}
    ${notes.length > 0 && html`<div class="row" role="button" onClick=${() => goTab('together')}><span class="lead tint-rose">💌</span><div class="grow"><b>Nota de ${S.state.partner?.name}</b><small class="muted">${notes.at(-1).text}</small></div><${Icon} name="right" size=${16} class="chev" /></div>`}
    ${newRoutines.length > 0 && html`<div class="row" role="button" onClick=${() => goTab('together')}><span class="lead tint-rose">🏋️</span><div class="grow"><b>${S.state.partner?.name} te recomendó una rutina</b><small class="muted">${newRoutines[0].name}</small></div><${Icon} name="right" size=${16} class="chev" /></div>`}
    ${pending > 0 && html`<div class="row" role="button" onClick=${() => goTab('rewards')}><span class="lead tint-rose">🎁</span><div class="grow"><b>${pending} idea${pending > 1 ? 's' : ''} por decidir</b><small class="muted">Tu pareja propuso un premio</small></div><${Icon} name="right" size=${16} class="chev" /></div>`}
    ${ios && !hideIos && html`<div class="row static"><span class="lead">📲</span><div class="grow"><b>Instálala como app</b><small class="muted">Safari → Compartir → Agregar a pantalla de inicio. Así te llegan las notificaciones</small></div><button class="icon-btn flat" onClick=${() => { try { localStorage.setItem('lindwyrm.iosTip', '1'); } catch {} setHideIos(true); }} aria-label="Cerrar"><${Icon} name="x" size=${16} /></button></div>`}
  </div>`;
}

function PartnerCard({ partner }) {
  const [challenge, setChallenge] = useState(false);
  const [other, setOther] = useState(() => !!S.state.pendingInvite); // llegó con un enlace de otra persona
  if (!partner) {
    return html`<section class="card rise invite" style="--i:3">
      <h2>Invita a tu pareja</h2>
      <p class="muted small">Todavía no se une. Mándale el enlace: abre “Únete” con el código ya escrito.</p>
      <div class="invite-code sm">${(S.state.invite || '······').split('').map((c) => html`<span>${c}</span>`)}</div>
      <div class="pc-actions">
        <button class="btn primary sm" onClick=${() => shareInvite(S.state.invite, S.state.me?.name)}><${Icon} name="send" size=${15} /> Compartir enlace</button>
        <button class="btn tinted sm" onClick=${() => copyInvite(S.state.invite)}><${Icon} name="copy" size=${15} /> Copiar</button>
      </div>
      <button class="link muted" onClick=${() => setOther(true)}>Tengo el código de otra persona</button>
      ${other && html`<${JoinOtherSheet} onClose=${() => { setOther(false); S.setPendingInvite(null); }} />`}
    </section>`;
  }
  const d = partner.doc;
  const info = d ? L.streakInfo(d) : null;
  const ck = d?.checkins[L.ymd()];
  const sk = d?.skips?.[L.ymd()];
  const skKey = `skipline:${partner.id}:${L.ymd()}`;
  const cheer = async () => { const r = await S.sendMessage(L.PHRASES[Math.floor(Math.random() * L.PHRASES.length)], 'cheer'); toast(r.ok ? `Nota enviada a ${partner.name}` : r.data.error, { icon: r.ok ? '💌' : '⚠️' }); };
  return html`<section class="card partner-card rise" style="--i:3">
    <button class="pc-main" onClick=${() => openScreen('partner')} aria-label=${`Ver el perfil de ${partner.name}`}>
      <${Avatar} doc=${d || { name: partner.name }} size=${46} />
      <div class="grow">
        <b>${partner.name}</b>
        <small class="muted">${!d ? 'Aún sin datos' : ck ? '✅ Ya entrenó hoy' : sk ? '😔 Hoy no fue al gym' : info.atRisk ? '⚠️ Hoy es su último día de margen' : 'Aún no entrena hoy'}</small>
      </div>
      ${info && html`<div class="pc-streak"><${Flame} size=${22} lit=${info.alive} /><b>${info.current}</b></div>`}
    </button>
    ${partner.push === false && html`<p class="nopush muted small">🔕 ${partner.name} aún no tiene las notificaciones activadas: no se entera de tus avisos hasta que abra la app.</p>`}
    ${sk && !ck && !S.isDismissed(skKey) && html`<div class="skip-note"><span>“${sk.reason}”</span><button class="icon-btn flat" onClick=${() => S.dismiss(skKey)} aria-label="Cerrar este aviso"><${Icon} name="x" size=${16} /></button></div>`}
    <div class="pc-actions">
      <button class="btn tinted sm" onClick=${cheer}><${Icon} name="heart" size=${15} /> Mandar ánimo</button>
      <button class="btn tinted sm" onClick=${() => setChallenge(true)}><${Icon} name="target" size=${15} /> Retar</button>
    </div>
    ${challenge && html`<${NewChallengeSheet} onClose=${() => setChallenge(false)} />`}
  </section>`;
}

function Goals({ me }) {
  const goals = L.exerciseCatalog(me).slice(0, 3);
  return html`<section class="card rise" style="--i:5">
    <h2>Tu meta para la próxima</h2>
    ${goals.length
      ? goals.map((g) => { const s = L.suggestNext(me, g.name); return s && html`<div class="goal-row"><div class="grow"><b>${g.name}</b><small class="muted">Última vez ${fmtShort(s.last.date)}: ${s.last.sets.map((x) => `${x.reps}×${x.kg || 'PC'}`).join(' · ')}</small></div><div class=${cx('target-pill', s.up && 'up')}>${s.sets}×${s.reps}<small>${s.kg ? fmtKg(s.kg) : 'peso corporal'}</small>${s.up && html`<em>⬆ sube peso</em>`}</div></div>`; })
      : html`<p class="muted">Registra tu primer entreno y aquí te digo cuánto subirle la próxima vez.</p>`}
  </section>`;
}
