import { html } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import { Icon, ToastHost, cx } from './kit.js';
import { nav, goTab, openScreen, useApp } from './nav.js';
import { Auth } from './auth.js';
import { Today } from './today.js';
import { Progress } from './progress.js';
import { Partner } from './partner.js';
import { Rewards } from './rewards.js';
import { Workout } from './workout.js';
import { CheckIn } from './checkin.js';
import { Profile, Onboarding } from './profile.js';

const SCREENS = { today: Today, progress: Progress, partner: Partner, rewards: Rewards };
const OVERLAYS = { workout: Workout, checkin: CheckIn, profile: Profile };

export function App() {
  const st = useApp();
  if (!st.auth) return html`<${Auth} /><${ToastHost} />`;
  if (!st.me) return html`<div class="boot"><div class="spinner"></div><p class="muted">Cargando tu espacio…</p>${S.net.online === false && html`<p class="notice">Sin conexión. Reintentaremos al volver la señal.</p>`}</div>`;

  const offline = !S.net.online;
  const Screen = SCREENS[nav.tab];
  const top = nav.stack.at(-1);
  const Overlay = top && OVERLAYS[top.id];
  const badge = { partner: S.unread(), rewards: S.pendingForMe().length };
  const tabs = [['today', 'home', 'Hoy'], ['progress', 'chart', 'Progreso'], null, ['partner', 'heart', S.state.partner?.name || 'Pareja'], ['rewards', 'gift', 'Premios']];

  return html`<div class="app" style=${`--accent:${st.me.color}`}>
    ${offline && html`<div class="net-pill" role="status">Sin conexión · todo se guarda en tu teléfono</div>`}
    <main class=${cx('page', offline && 'has-net')} key=${nav.tab} aria-hidden=${!!Overlay}><${Screen} /></main>
    <nav class="tabbar" aria-label="Navegación">
      ${tabs.map((t) => t ? html`<button class=${cx('tab', nav.tab === t[0] && 'on')} onClick=${() => goTab(t[0])} aria-current=${nav.tab === t[0] ? 'page' : null}>
          <span class="tab-ic"><${Icon} name=${t[1]} size=${23} sw=${nav.tab === t[0] ? 2.2 : 1.7} />${badge[t[0]] > 0 && html`<b class="badge">${badge[t[0]]}</b>`}</span><span class="tab-lb">${t[2]}</span></button>`
        : html`<button class=${cx('fab', st.draft && 'live')} onClick=${() => openScreen('workout')} aria-label=${st.draft ? 'Continuar entreno' : 'Nuevo entreno'}><${Icon} name="dumbbell" size=${26} sw=${2.2} /></button>`)}
    </nav>
    ${Overlay && html`<${Overlay} key=${top.id} ...${top.props} />`}
    ${!st.me.onboarded && !st.me.heightCm && !Overlay && html`<${Onboarding} onClose=${() => {}} />`}
    <${ToastHost} />
  </div>`;
}
