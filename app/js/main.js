import * as S from './store.js';
import { render, bind } from './ui.js';

bind();
S.subscribe(render);
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
