import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Avatar, Sheet, Field, Segmented, toast, cx } from './kit.js';
import { haptic } from '../theme.js';

const EMOJIS = ['💊', '🐟', '🍊', '🌿', '🥛', '🧴', '💧', '🫐'];
const DAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** Juntos → Suplementos: cada quien marca lo que se tomó hoy; la pareja lo ve. */
export function SuppPanel() {
  const me = S.state.me;
  const partner = S.state.partner;
  const [sheet, setSheet] = useState(false);
  const list = L.suppList(me);
  const taken = L.suppTaken(me);
  const pd = partner?.doc;

  return html`<div class="stack-lg">
    <section class="card rise">
      <div class="row-between"><h2>Mis suplementos de hoy</h2><button class="btn tinted sm" onClick=${() => setSheet(true)}><${Icon} name="plus" size=${16} /> Agregar</button></div>
      ${list.length === 0 && html`<p class="muted">No tienes suplementos en tu lista. Agrega los que te tomas.</p>`}
      <div class="supp-list">
        ${list.map((x) => html`<button class=${cx('supp-row', taken.has(x.id) && 'on')} onClick=${() => { haptic(); S.toggleSupp(x.id); }} aria-pressed=${taken.has(x.id)}>
          <span class="supp-ic">${x.emoji}</span>
          <span class="grow"><b>${x.name}</b><small class="muted">${x.when === 'gym' ? 'Con el gym' : 'Todos los días'}</small></span>
          <span class="supp-tick"><${Icon} name="check" size=${20} sw=${3} /></span>
        </button>`)}
      </div>
      <${Week} doc=${me} />
    </section>

    ${partner && html`<section class="card rise" style="--i:1">
      <div class="row-between"><h2>${partner.name} hoy</h2><${Avatar} doc=${pd || { name: partner.name }} size=${34} /></div>
      ${!pd ? html`<p class="muted">Aún sin datos.</p>` : html`
        <div class="supp-list">${L.suppList(pd).length === 0 ? html`<p class="muted">No tiene suplementos en su lista.</p>` : L.suppList(pd).map((x) => {
          const on = L.suppTaken(pd).has(x.id);
          return html`<div class=${cx('supp-row ro', on && 'on')}><span class="supp-ic">${x.emoji}</span><span class="grow"><b>${x.name}</b><small class="muted">${on ? 'Ya se lo tomó' : 'Todavía no'}</small></span><span class="supp-tick"><${Icon} name=${on ? 'check' : 'x'} size=${18} sw=${3} /></span></div>`;
        })}</div>
        <${Week} doc=${pd} />`}
    </section>`}
    ${sheet && html`<${AddSupp} me=${me} onClose=${() => setSheet(false)} />`}
  </div>`;
}

function Week({ doc }) {
  const days = L.suppWeek(doc);
  return html`<div class="supp-week" aria-label="Últimos 7 días">${days.map((d) => html`<div class=${cx('supp-day', d.state, d.today && 'today')}><span>${DAY[new Date(d.date + 'T12:00:00').getDay()]}</span><i></i></div>`)}</div>`;
}

function AddSupp({ me, onClose }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('💊');
  const [when, setWhen] = useState('daily');
  const list = L.suppList(me);
  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    S.addSupp({ name, emoji, when });
    toast('Suplemento agregado', { icon: emoji });
    setName('');
  };
  return html`<${Sheet} title="Mis suplementos" onClose=${onClose}>
    <form class="stack" onSubmit=${add}>
      <${Field} label="Nombre"><input value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Multivitamínico, omega 3…" maxlength="30" /><//>
      <div class="chips">${EMOJIS.map((x) => html`<button type="button" class=${cx('chip pick', emoji === x && 'on')} onClick=${() => setEmoji(x)} aria-label=${`Icono ${x}`}>${x}</button>`)}</div>
      <${Segmented} value=${when} onChange=${setWhen} options=${[{ id: 'daily', label: 'Todos los días' }, { id: 'gym', label: 'Con el gym' }]} />
      <button class="btn primary block lg" disabled=${!name.trim()}>Agregar a mi lista</button>
    </form>
    ${list.length > 0 && html`<h3 class="sec-h">En mi lista</h3>
      <div class="group">${list.map((x) => html`<div class="row static"><span class="lead">${x.emoji}</span><div class="grow"><b>${x.name}</b><small class="muted">${x.when === 'gym' ? 'Con el gym' : 'Todos los días'}</small></div>
        <button class="icon-btn flat" onClick=${() => { if (confirm(`¿Quitar ${x.name} de tu lista?`)) S.removeSupp(x.id); }} aria-label=${`Quitar ${x.name}`}><${Icon} name="trash" size=${17} /></button></div>`)}</div>`}
  <//>`;
}
