import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Flame, Avatar, Ring, CountUp, Sheet, Photo, toast, cx, fmtKg, fmtShort } from './kit.js';
import { openScreen, goTab } from './nav.js';

const CHEERS = ['¡Vamos, tú puedes! 💪', '¡Hoy toca! 🏋️', 'Esa racha no se rompe 🔥'];

export function Today() {
  const me = S.state.me;
  const partner = S.state.partner;
  const info = L.streakInfo(me);
  const [water, setWater] = useState(false);
  const bal = L.balance(me);
  const goals = L.exerciseCatalog(me).slice(0, 3);
  const todayCk = me.checkins[L.ymd()];
  const draft = S.state.draft;

  return html`<div class="view-in">
    <${Header} me=${me} bal=${bal} />
    <${Banners} />

    <section class="card hero rise" style="--i:0">
      <div class="streak-row">
        <div class=${cx('flame-wrap', info.alive && 'alive', info.atRisk && 'risk')}>
          <${Flame} size=${84} lit=${info.alive} />
        </div>
        <div class="streak-txt">
          <div class="streak-n"><b><${CountUp} value=${info.current} /></b><span>${info.current === 1 ? 'día de racha' : 'días de racha'}</span></div>
          <p class=${cx('streak-sub', info.atRisk && 'warn')}>${streakText(info, me)}</p>
        </div>
      </div>
      <div class="week">${L.weekDots(me).map((d) => html`<div class=${cx('wd', d.done && 'done', d.today && 'today', d.future && 'future')}><span>${d.label}</span><i>${d.done ? html`<${Icon} name="check" size=${14} sw=${3.2} />` : ''}</i></div>`)}</div>
      ${info.paused
        ? html`<button class="btn block" onClick=${() => S.endPause()}>Terminar pausa de racha</button>`
        : html`<div class="cta-row">
            <button class="btn primary block lg" onClick=${() => openScreen('workout')}><${Icon} name="dumbbell" size=${20} /> ${draft ? 'Continuar entreno' : 'Empezar entreno'}</button>
            ${!todayCk && html`<button class="btn lg sq" onClick=${() => openScreen('checkin')} aria-label="Solo foto de hoy"><${Icon} name="camera" size=${20} /></button>`}
          </div>`}
      ${todayCk && html`<p class="muted small center done-line">✅ Hoy ya cuenta · ${todayCk.time} h${todayCk.photo ? '' : ' · sin foto'}</p>`}
    </section>

    <${PartnerCard} partner=${partner} me=${me} />

    <div class="grid2">
      <button class="card mini rise" style="--i:2" onClick=${() => setWater(true)}>
        <div class="mini-top"><span class="mini-ic water"><${Icon} name="drop" size=${18} /></span><small>Agua</small></div>
        <b class="mini-n"><${CountUp} value=${(me.water[L.ymd()] || 0) / 1000} dec=${2} ms=${500} /> L</b>
        <div class="meter"><i style=${`width:${Math.min(100, ((me.water[L.ymd()] || 0) / me.waterGoalMl) * 100)}%`}></i></div>
        <small class="muted">meta ${me.waterGoalMl / 1000} L</small>
      </button>
      <button class="card mini rise" style="--i:3" onClick=${() => goTab('rewards')}>
        <div class="mini-top"><span class="mini-ic gold"><${Icon} name="coin" size=${18} /></span><small>Tokens</small></div>
        <b class="mini-n gold"><${CountUp} value=${bal} /></b>
        <small class="muted">${nextReward(bal)}</small>
      </button>
    </div>

    <section class="card rise" style="--i:4">
      <h2>Tus metas para la próxima</h2>
      ${goals.length
        ? goals.map((g) => { const s = L.suggestNext(me, g.name); return s && html`<div class="goal-row"><div class="grow"><b>${g.name}</b><small class="muted">Última vez ${fmtShort(s.last.date)}: ${s.last.sets.map((x) => `${x.reps}×${x.kg || 'PC'}`).join(' · ')}</small></div><div class=${cx('target-pill', s.up && 'up')}>${s.sets}×${s.reps}<small>${s.kg ? fmtKg(s.kg) : 'peso corporal'}</small>${s.up && html`<em>⬆ sube peso</em>`}</div></div>`; })
        : html`<p class="muted">Registra tu primer entreno y aquí te digo cuánto subirle la próxima vez.</p>`}
    </section>

    ${water && html`<${WaterSheet} me=${me} onClose=${() => setWater(false)} />`}
  </div>`;
}

function streakText(info, me) {
  if (info.paused) return 'Racha en pausa ⏸ — descansa tranquilo.';
  if (info.doneToday) return `¡Hoy cumpliste! Mejor racha: ${info.longest}.`;
  if (info.atRisk) return '¡Hoy es tu último día para mantenerla!';
  if (info.alive) return info.daysLeft === 1 ? 'Tienes 1 día más de margen. Entrena hoy o mañana.' : `Tienes ${info.daysLeft} días de margen.`;
  if (info.total > 0) return `Se reinició, pero tu mejor fue ${info.longest}. Empieza una nueva hoy.`;
  return 'Entrena y tómate la foto del espejo para encenderla.';
}

const nextReward = (bal) => {
  const next = S.state.proposals.filter((p) => p.status === 'accepted').sort((a, b) => a.cost - b.cost).find((p) => p.cost > bal);
  return next ? `Faltan ${next.cost - bal} para ${next.emoji}` : 'Propongan un premio 🎁';
};

function Header({ me, bal }) {
  const h = new Date().getHours();
  const hi = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return html`<header class="top">
    <div><small class="muted">${hi}</small><h1>${me.name}</h1></div>
    <button class="avatar-btn" onClick=${() => openScreen('profile')} aria-label="Mi perfil"><${Avatar} doc=${me} size=${44} ring /></button>
  </header>`;
}

/** Avisos importantes: mensajes nuevos, ideas por decidir, conexión, instalación en iPhone. */
function Banners() {
  const msgs = S.state.messages.filter((m) => m.from !== S.state.auth.uid && m.kind !== 'reaction' && m.ts > S.state.seenAt);
  const pending = S.pendingForMe().length;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
  const [hideIos, setHideIos] = useState(() => { try { return !!localStorage.getItem('gymduo.iosTip'); } catch { return false; } });
  return html`<div class="banners">
    ${msgs.length > 0 && html`<button class="banner" onClick=${() => goTab('partner')}><span>💌</span><div><b>${S.state.partner?.name}</b><small>${msgs.at(-1).text}</small></div></button>`}
    ${pending > 0 && html`<button class="banner" onClick=${() => goTab('rewards')}><span>🎁</span><div><b>${pending} idea${pending > 1 ? 's' : ''} por decidir</b><small>Tu pareja propuso un premio</small></div></button>`}
    ${ios && !hideIos && html`<div class="banner tip"><span>📲</span><div><b>Instálala como app</b><small>En Safari: Compartir → Agregar a pantalla de inicio</small></div><button class="icon-btn" onClick=${() => { try { localStorage.setItem('gymduo.iosTip', '1'); } catch {} setHideIos(true); }} aria-label="Cerrar"><${Icon} name="x" size=${16} /></button></div>`}
  </div>`;
}

function PartnerCard({ partner, me }) {
  if (!partner) {
    return html`<section class="card rise invite" style="--i:1">
      <h2>Invita a tu pareja</h2>
      <p class="muted small">Todavía no se une. Pásale este código:</p>
      <div class="invite-code sm">${(S.state.invite || '······').split('').map((c) => html`<span>${c}</span>`)}</div>
      <button class="btn block" onClick=${() => { navigator.clipboard?.writeText(S.state.invite || ''); toast('Código copiado', { icon: '📋' }); }}><${Icon} name="copy" size=${16} /> Copiar código</button>
    </section>`;
  }
  const d = partner.doc;
  const info = d ? L.streakInfo(d) : null;
  const sentCheer = async () => { const r = await S.sendMessage(CHEERS[Math.floor(Math.random() * CHEERS.length)], 'cheer'); toast(r.ok ? `Ánimo enviado a ${partner.name}` : r.data.error, { icon: r.ok ? '💪' : '⚠️' }); };
  const ck = d?.checkins[L.ymd()];
  return html`<section class="card partner-card rise" style=${`--i:1;${d ? `--p:${d.color}` : ''}`}>
    <button class="pc-main" onClick=${() => goTab('partner')}>
      <${Avatar} doc=${d || { name: partner.name }} size=${46} />
      <div class="grow">
        <b>${partner.name}</b>
        <small class="muted">${!d ? 'Aún sin datos' : ck ? '✅ Ya entrenó hoy' : info.atRisk ? '⚠️ Hoy es su último día de margen' : 'Aún no entrena hoy'}</small>
      </div>
      ${info && html`<div class="pc-streak"><${Flame} size=${22} lit=${info.alive} /><b>${info.current}</b></div>`}
    </button>
    <div class="pc-actions">
      <button class="btn sm" onClick=${sentCheer}>💪 Mandar ánimo</button>
      <button class="btn sm ghost" onClick=${() => goTab('partner')}>Ver su perfil <${Icon} name="right" size=${14} /></button>
    </div>
  </section>`;
}

export function WaterSheet({ me, onClose }) {
  const ml = me.water[L.ymd()] || 0;
  const goal = me.waterGoalMl;
  const [custom, setCustom] = useState('');
  const done = ml >= goal;
  const add = (v) => {
    const before = ml;
    S.addWater(v);
    if (v > 0 && before < goal && before + v >= goal) toast(`¡Meta de agua! +${L.EARN.water} 🪙`, { icon: '💧' });
  };
  return html`<${Sheet} title="Agua de hoy" onClose=${onClose}>
    <div class="center">
      <${Ring} value=${ml} max=${goal} size=${190} stroke=${16} color="var(--water)">
        <b class="ring-big"><${CountUp} value=${ml / 1000} dec=${2} ms=${500} /></b><small>de ${goal / 1000} L</small>
      <//>
    </div>
    <p class="center big-note">${done ? `¡Meta cumplida! +${L.EARN.water} 🪙 ganados hoy 💧` : `Te faltan ${((goal - ml) / 1000).toFixed(2)} L · ganas +${L.EARN.water} 🪙 al llegar`}</p>
    <div class="quick">${[150, 250, 500, 750].map((v) => html`<button class="btn" onClick=${() => add(v)}>+${v} ml</button>`)}</div>
    <form class="inline" onSubmit=${(e) => { e.preventDefault(); if (L.num(custom) > 0) { add(Math.round(L.num(custom))); setCustom(''); } }}>
      <input inputmode="numeric" placeholder="Otra cantidad (ml)" value=${custom} onInput=${(e) => setCustom(e.target.value)} />
      <button class="btn">Agregar</button>
    </form>
    <button class="link" onClick=${() => add(-250)}>Deshacer −250 ml</button>
  <//>`;
}
