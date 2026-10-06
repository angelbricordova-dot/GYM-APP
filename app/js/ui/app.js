import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import { applyAccent, applyTheme } from '../theme.js';
import { Icon, ToastHost, cx, fmtDur } from './kit.js';
import { nav, goTab, openScreen, useApp } from './nav.js';
import { Auth } from './auth.js';
import { Today } from './today.js';
import { Train } from './train.js';
import { Progress } from './progress.js';
import { Together } from './together.js';
import { Rewards } from './rewards.js';
import { Workout } from './workout.js';
import { CheckIn } from './checkin.js';
import { Profile, Onboarding } from './profile.js';

const SCREENS = { today: Today, train: Train, progress: Progress, together: Together, rewards: Rewards };
const OVERLAYS = { workout: Workout, checkin: CheckIn, profile: Profile };
// Cinco secciones, una palabra cada una (guía de iOS: pocas pestañas, etiquetas cortas, la barra solo navega).
const TABS = [['today', 'home', 'Hoy'], ['train', 'dumbbell', 'Entrenar'], ['progress', 'chart', 'Progreso'], ['together', 'users', 'Juntos'], ['rewards', 'heart', 'Puntos']];

export function App() {
  const st = useApp();
  const [, tick] = useState(0);
  useEffect(() => { applyTheme(); }, []);
  useEffect(() => { if (!st.draft) return; const id = setInterval(() => tick((v) => v + 1), 1000); return () => clearInterval(id); }, [!!st.draft]);
  useEffect(() => { if (st.me) applyAccent(st.me.color); }, [st.me?.color]);

  if (!st.auth) return html`<${Auth} /><${ToastHost} />`;
  if (!st.me) return html`<div class="boot"><div class="spinner"></div><p class="muted">Cargando tu espacio…</p>${S.net.online === false && html`<p class="notice">Sin conexión. Reintentaremos al volver la señal.</p>`}</div>`;

  const offline = !S.net.online;
  const Screen = SCREENS[nav.tab];
  const top = nav.stack.at(-1);
  const Overlay = top && OVERLAYS[top.id];
  const badge = {
    together: S.challengesForMe().length + S.challengesToReview().length + S.unread(),
    rewards: S.pendingForMe().length,
  };

  return html`<div class="app">
    ${offline && html`<div class="net-pill" role="status">Sin conexión · todo se guarda en tu teléfono</div>`}
    <main class=${cx('page', offline && 'has-net')} key=${nav.tab} aria-hidden=${!!Overlay}><${Screen} /></main>
    ${st.draft && !Overlay && nav.tab !== 'train' && html`<button class="mini-workout" onClick=${() => openScreen('workout')}>
      <i class="live-dot"></i><span class="grow"><b>Entreno en curso</b><small>${fmtDur(Math.floor((Date.now() - st.draft.startedAt) / 1000))} · ${st.draft.exercises.length} ejercicios</small></span><b class="mw-go">Continuar</b>
    </button>`}
    <nav class="tabbar" aria-label="Navegación">
      ${TABS.map(([id, icon, label]) => html`<button class=${cx('tab', nav.tab === id && 'on')} onClick=${() => goTab(id)} aria-current=${nav.tab === id ? 'page' : null}>
        <span class="tab-ic"><${Icon} name=${icon} size=${24} sw=${nav.tab === id ? 2.1 : 1.7} fill=${nav.tab === id ? 0.2 : 0} />${badge[id] > 0 && html`<b class="badge">${badge[id]}</b>`}</span>
        <span class="tab-lb">${label}</span>
      </button>`)}
    </nav>
    ${Overlay && html`<${Overlay} key=${top.id} ...${top.props} />`}
    ${!st.me.onboarded && !st.me.heightCm && !Overlay && html`<${Onboarding} onClose=${() => {}} />`}
    <${ToastHost} />
  </div>`;
}
