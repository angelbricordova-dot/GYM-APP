import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Heart, Points, Sheet, Segmented, Stepper, Field, CountUp, Empty, Confetti, puntos, toast, cx, fmtDay } from './kit.js';

const IDEAS = [
  ['🎬', 'Ver una película juntos', 50], ['🍦', 'Salir por un helado', 40], ['🍕', 'Noche de pizza', 120],
  ['🍽️', 'Cena especial', 250], ['💆', 'Masaje en casa', 150], ['🛌', 'Desayuno en la cama', 100],
  ['🎮', 'Tarde de videojuegos', 60], ['✈️', 'Escapada de fin de semana', 800],
];

export function Rewards() {
  const me = S.state.me;
  const partner = S.state.partner;
  const [tab, setTab] = useState('prizes');
  const [propose, setPropose] = useState(false);
  const pending = S.pendingForMe();
  const bal = L.balance(me);
  const active = S.state.proposals.filter((p) => p.status === 'accepted').sort((a, b) => a.cost - b.cost);
  const next = active.find((p) => p.cost > bal);
  const from = Math.max(0, ...active.filter((p) => p.cost <= bal).map((p) => p.cost));

  return html`<div class="view-in">
    <header class="top large"><div><small class="muted">Sus hábitos valen la pena</small><h1>Puntos de amor</h1></div></header>

    <section class="card coin-hero rise">
      <div class="coin"><${Heart} size=${44} /></div>
      <div class=${cx('coin-n', bal < 0 && 'debt')}>${bal < 0 && html`<span class="debt-badge">Deuda</span>`}<b class=${cx(bal < 0 && 'neg')}><${CountUp} value=${bal} /></b><small>${bal < 0 ? `Tienes una deuda de ${puntos(-bal)} de amor · se paga con los próximos que ganes` : 'puntos de amor'}</small></div>
      ${next ? html`<div class="next"><div class="meter gold"><i style=${`width:${Math.min(100, ((bal - from) / (next.cost - from)) * 100)}%`}></i></div><small class="muted">Faltan ${next.cost - bal} para ${next.emoji} ${next.name}</small></div>` : html`<small class="muted">${active.length ? '¡Ya te alcanza para todo! Elige uno 🎉' : 'Propongan su primer premio en “Ideas”.'}</small>`}
    </section>

    <${Segmented} value=${tab} onChange=${setTab} options=${[{ id: 'prizes', label: 'Premios' }, { id: 'ideas', label: 'Ideas', badge: pending.length || null }, { id: 'history', label: 'Historial' }]} />
    ${tab === 'prizes' && html`<${Prizes} active=${active} bal=${bal} me=${me} partner=${partner} onIdeas=${() => setTab('ideas')} />`}
    ${tab === 'ideas' && html`<${Ideas} me=${me} partner=${partner} onPropose=${() => setPropose(true)} />`}
    ${tab === 'history' && html`<${History} me=${me} />`}
    ${propose && html`<${ProposeSheet} onClose=${() => setPropose(false)} />`}
  </div>`;
}

const who = (id, partner) => (id === S.state.auth.uid ? 'Tú' : partner?.name || 'Tu pareja');

function Prizes({ active, bal, me, partner, onIdeas }) {
  const [celebrate, setCelebrate] = useState(false);
  const [change, setChange] = useState(null); // premio al que le cambio el precio
  const uid = S.state.auth.uid;
  const price = async (p, action, cost) => {
    const r = await S.decide(p.id, action, cost);
    if (!r.ok) return toast(r.data.error, { icon: '⚠️' });
    toast({ change: 'Propuesta enviada: tu pareja decide', 'accept-change': `Listo: ahora cuesta ${r.data.proposal.cost} puntos`, 'decline-change': 'Se queda con el precio actual', 'cancel-change': 'Cambio cancelado' }[action], { icon: action === 'accept-change' ? '✅' : '💱' });
  };
  const open = S.state.vouchers.filter((v) => v.status === 'open');
  const redeem = async (p) => {
    if (!confirm(`¿Canjear “${p.name}” por ${p.cost} puntos de amor?`)) return;
    const r = await S.redeem(p);
    if (r.ok) { setCelebrate(true); setTimeout(() => setCelebrate(false), 1800); toast(`${p.emoji} ¡A disfrutarlo!`); }
    else toast(r.data.error, { icon: '⚠️' });
  };
  return html`<div class="stack-lg">
    ${celebrate && html`<${Confetti} n=${36} />`}
    ${open.length > 0 && html`<section class="card rise"><h2>Cupones por cumplir</h2>${open.map((v) => html`<div class="reward"><span class="emoji">${v.emoji}</span><div class="grow"><b>${v.name}</b><small class="muted">Canjeado por ${who(v.by, partner)} · ${fmtDay(L.ymd(new Date(v.ts)))}</small></div><button class="btn sm primary" onClick=${async () => { const r = await S.markVoucherDone(v.id); if (r.ok) toast('¡Cumplido!', { icon: '✅' }); }}>Hecho</button></div>`)}</section>`}
    ${S.priceChangesForMe().length > 0 && html`<section class="card rise attn"><h2>Cambio de precio</h2>${S.priceChangesForMe().map((p) => html`<div class="idea">
      <div class="idea-top"><span class="emoji">${p.emoji}</span><div class="grow"><b>${p.name}</b><small class="muted">${who(p.change.by, partner)} quiere cambiar el precio: <${Points} n=${p.cost} size=${13} /> → <${Points} n=${p.change.cost} size=${13} /></small></div></div>
      <div class="idea-actions"><button class="btn sm primary" onClick=${() => price(p, 'accept-change')}>Aceptar ${p.change.cost}</button><button class="btn sm ghost" onClick=${() => price(p, 'decline-change')}>Dejarlo en ${p.cost}</button></div>
    </div>`)}</section>`}
    <section class="card rise" style="--i:1">
      <h2>Canjear</h2>
      ${active.length ? active.map((p) => html`<div class="reward-wrap"><div class="reward">
        <span class="emoji">${p.emoji}</span>
        <div class="grow"><b>${p.name}</b><small class="muted"><${Points} n=${p.cost} size=${13} />${p.note ? ` · ${p.note}` : ''}</small></div>
        <button class=${cx('btn sm', bal >= p.cost && 'primary')} disabled=${bal < p.cost} onClick=${() => redeem(p)}>${bal >= p.cost ? 'Canjear' : `Faltan ${p.cost - bal}`}</button>
      </div>
      ${p.change && p.change.by === uid
        ? html`<div class="price-box pending"><span class="pb-ic">⏳</span><div class="grow"><b>Propusiste ${p.change.cost} puntos</b><small>${partner ? `${partner.name} decide si lo acepta` : 'Esperando respuesta'}</small></div><button class="btn sm tinted" onClick=${() => price(p, 'cancel-change')}>Cancelar</button></div>`
        : !p.change && html`<button class="price-box ask" onClick=${() => setChange(p)}><span class="pb-ic">💱</span><div class="grow"><b>Pensármelo mejor</b><small>Proponer otro precio para este premio</small></div><${Icon} name="right" size=${16} class="chev" /></button>`}
      </div>`) : html`<${Empty} icon="🎁" title="Aún no hay premios" text="Un premio existe cuando uno lo propone y el otro lo acepta." action=${html`<button class="btn primary" onClick=${onIdeas}>Ir a Ideas</button>`} />`}
    </section>
    ${change && html`<${CounterSheet} p=${change} title="Cambiar el precio" text=${`“${change.emoji} ${change.name}” cuesta ${change.cost} puntos. Si lo piensas mejor, propón otro precio: ${partner?.name || 'tu pareja'} tiene que aceptarlo y mientras tanto sigue valiendo el actual.`} cta="Proponer este precio" onClose=${() => setChange(null)} onSend=${(c) => { price(change, 'change', c); setChange(null); }} />`}
    <section class="card rise" style="--i:2">
      <h2>Cómo ganar puntos de amor</h2>
      <ul class="earn">
        <li><span>📸 Entrenar y tomar la foto de salida</span><b>+${L.EARN.checkin}</b></li>
        <li><span>🏆 Récord en un ejercicio</span><b>+${L.EARN.pr}</b></li>
        <li><span>📆 Cumplir tu meta semanal</span><b>+${L.EARN.week}</b></li>
        <li><span>🔥 Hitos de racha (3, 7, 14, 30…)</span><b>+10 a +250</b></li>
        <li><span>🎯 Retos que tu pareja te aprueba</span><b>los que pongan</b></li>
      </ul>
    </section>
  </div>`;
}

function Ideas({ me, partner, onPropose }) {
  const uid = S.state.auth.uid;
  const all = S.state.proposals;
  const mine = all.filter((p) => p.status === 'pending' && p.lastBy === uid);
  const toMe = all.filter((p) => p.status === 'pending' && p.lastBy !== uid);
  const declined = all.filter((p) => p.status === 'declined');
  const [counter, setCounter] = useState(null);

  const decide = async (p, action, cost) => {
    const r = await S.decide(p.id, action, cost);
    if (!r.ok) return toast(r.data.error, { icon: '⚠️' });
    toast(action === 'accept' ? '¡Premio aprobado! 🎉' : action === 'decline' ? 'Idea rechazada' : 'Contraoferta enviada', { icon: action === 'accept' ? '✅' : '↔️' });
  };

  return html`<div class="stack-lg">
    <button class="btn primary block lg" onClick=${onPropose}><${Icon} name="plus" size=${20} /> Proponer un premio</button>
    ${!partner && html`<p class="notice">Tu pareja aún no se une: podrán decidir juntos cuando entre.</p>`}
    ${toMe.length > 0 && html`<section class="card rise attn"><h2>Esperan tu respuesta</h2>${toMe.map((p) => html`<div class="idea">
      <div class="idea-top"><span class="emoji">${p.emoji}</span><div class="grow"><b>${p.name}</b><small class="muted">${who(p.lastBy, partner)} ${p.history.length > 1 ? 'contraofertó' : 'propone'} · <${Points} n=${p.cost} size=${13} /></small>${p.note && html`<small class="muted">“${p.note}”</small>`}</div></div>
      <div class="idea-actions"><button class="btn sm primary" onClick=${() => decide(p, 'accept')}>Aceptar</button><button class="btn sm" onClick=${() => setCounter(p)}>Contraoferta</button><button class="btn sm ghost" onClick=${() => decide(p, 'decline')}>Rechazar</button></div>
    </div>`)}</section>`}
    ${mine.length > 0 && html`<section class="card rise" style="--i:1"><h2>Esperando respuesta</h2>${mine.map((p) => html`<div class="reward"><span class="emoji">${p.emoji}</span><div class="grow"><b>${p.name}</b><small class="muted"><${Points} n=${p.cost} size=${13} /> · ${partner ? `a ${partner.name} le toca decidir` : 'pendiente'}</small></div><span class="chip">⏳</span></div>`)}</section>`}
    ${toMe.length + mine.length === 0 && html`<${Empty} icon="💡" title="Sin ideas pendientes" text="Propón una salida, una cena, un día de spa… y que el otro lo apruebe o la ajuste." />`}
    ${declined.length > 0 && html`<details class="card"><summary>Rechazadas (${declined.length})</summary>${declined.map((p) => html`<div class="reward dim"><span class="emoji">${p.emoji}</span><div class="grow"><b>${p.name}</b><small class="muted"><${Points} n=${p.cost} size=${13} /></small></div></div>`)}</details>`}
    ${counter && html`<${CounterSheet} p=${counter} onClose=${() => setCounter(null)} onSend=${(c) => { decide(counter, 'counter', c); setCounter(null); }} />`}
  </div>`;
}

function ProposeSheet({ onClose }) {
  const [f, setF] = useState({ emoji: '🎁', name: '', cost: '60', note: '' });
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await S.propose({ ...f, cost: L.num(f.cost) });
    setBusy(false);
    if (r.ok) { toast('Propuesta enviada 💌', { icon: '🎁' }); onClose(); } else toast(r.data.error, { icon: '⚠️' });
  };
  return html`<${Sheet} title="Proponer un premio" onClose=${onClose}>
    <div class="idea-chips">${IDEAS.map(([e, n, c]) => html`<button class=${cx('chip pick', f.name === n && 'on')} onClick=${() => setF({ ...f, emoji: e, name: n, cost: String(c) })}>${e} ${n}</button>`)}</div>
    <form class="stack" onSubmit=${send}>
      <div class="row-emoji"><${Field} label="Emoji"><input value=${f.emoji} onInput=${(e) => setF({ ...f, emoji: e.target.value })} maxlength="4" class="emoji-in" /><//><${Field} label="¿Qué proponen?"><input value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} maxlength="60" required placeholder="Ej. Ver una película juntos" /><//></div>
      <${Field} label="Costo en puntos de amor"><${Stepper} value=${f.cost} onChange=${(v) => setF({ ...f, cost: v })} step=${10} min=${1} label="Costo" /><//>
      <${Field} label="Nota (opcional)"><input value=${f.note} onInput=${(e) => setF({ ...f, note: e.target.value })} maxlength="140" placeholder="Detalles…" /><//>
      <button class="btn primary block lg" disabled=${busy || !f.name.trim()}>${busy ? 'Enviando…' : 'Enviar propuesta'}</button>
    </form>
  <//>`;
}

function CounterSheet({ p, onClose, onSend, title = 'Contraoferta', text, cta = 'Enviar contraoferta' }) {
  const [cost, setCost] = useState(String(p.cost));
  return html`<${Sheet} title=${title} onClose=${onClose}>
    <p class="muted">${text || html`<b>${p.emoji} ${p.name}</b> cuesta ${p.cost} puntos de amor. ¿Cuánto crees que debería costar?`}</p>
    <${Stepper} value=${cost} onChange=${setCost} step=${10} min=${1} label="Costo" />
    <button class="btn primary block lg" onClick=${() => onSend(L.num(cost))}>${cta}</button>
  <//>`;
}

function History({ me }) {
  const rows = L.ledgerSorted(me).slice(0, 40);
  return html`<section class="card rise"><h2>Movimientos</h2>
    ${rows.length ? rows.map((e) => html`<div class="ledger"><div class="grow"><b>${e.reason}</b><small class="muted">${fmtDay(e.date)}</small></div><b class=${e.delta > 0 ? 'pos' : 'neg'}>${e.delta > 0 ? '+' : ''}${e.delta}</b></div>`) : html`<p class="muted">Todavía no hay movimientos.</p>`}
  </section>`;
}
