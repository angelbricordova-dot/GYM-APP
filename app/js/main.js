import { html, render } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { App } from './ui/app.js';
import { goTab } from './ui/nav.js';

const TABS = ['today', 'train', 'progress', 'together', 'rewards'];

// Enlace de invitación (?join=CODIGO): se guarda el código y la pantalla de acceso abre “Únete” con él escrito.
const joinCode = new URL(location.href).searchParams.get('join');
if (joinCode) {
  if (!S.state.auth) S.setPendingInvite(joinCode.toUpperCase().slice(0, 12));
  history.replaceState(null, '', '/');
}

render(html`<${App} />`, document.getElementById('root'));
S.startSyncLoop(); // sin sesión no hace nada; al iniciar sesión ya está activo

// Al abrir desde una notificación (?tab=together) o si la app ya estaba abierta (mensaje del service worker).
const fromUrl = new URL(location.href).searchParams.get('tab');
if (TABS.includes(fromUrl)) { goTab(fromUrl); history.replaceState(null, '', '/'); }

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'nav' && TABS.includes(e.data.tab)) goTab(e.data.tab); });
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
