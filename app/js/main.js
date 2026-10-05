import { html, render } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { App } from './ui/app.js';

render(html`<${App} />`, document.getElementById('root'));
S.startSyncLoop(); // sin sesión no hace nada; al iniciar sesión ya está activo

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
