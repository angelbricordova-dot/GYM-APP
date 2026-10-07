// Tema claro/oscuro y color de acento. Son preferencias del teléfono (no se sincronizan).
import { onColor, contrast } from './logic.js';

const KEY = 'lindwyrm.theme';
const BG = { dark: '#08080d', light: '#f2f2f7' };
const mq = matchMedia('(prefers-color-scheme: dark)');

export const getTheme = () => { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } };
const resolve = (t) => (t === 'auto' ? (mq.matches ? 'dark' : 'light') : t);

/** Aplica el tema elegido (auto = el del sistema) y avisa a la barra de estado del teléfono. */
export function applyTheme(t = getTheme()) {
  const r = resolve(t);
  document.documentElement.dataset.theme = r;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', BG[r]);
  document.querySelector('meta[name=color-scheme]')?.setAttribute('content', r);
  applyAccent(); // el texto de acento depende del tema
}

export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch { /* sin storage */ }
  applyTheme(t);
}

mq.addEventListener?.('change', () => getTheme() === 'auto' && applyTheme('auto'));

/** Variables CSS de un acento: el color y el texto legible que va encima. */
export const accentVars = (hex) => `--accent:${hex};--on-accent:${onColor(hex)};--accent-text:${readableAccent(hex, document.documentElement.dataset.theme)}`;

const mixHex = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/** El acento como COLOR DE TEXTO: se acerca a negro (día) o blanco (noche) hasta llegar a 4.5:1 contra la tarjeta. */
export function readableAccent(hex, theme) {
  const card = theme === 'light' ? '#ffffff' : '#14141b';
  const toward = theme === 'light' ? '#000000' : '#ffffff';
  let c = hex;
  for (let t = 0; t <= 1 && contrast(c, card) < 4.5; t += 0.05) c = mixHex(hex, toward, t);
  return c;
}

export function applyAccent(hex = lastAccent) {
  lastAccent = hex;
  const s = document.documentElement.style;
  s.setProperty('--accent', hex);
  s.setProperty('--on-accent', onColor(hex));
  s.setProperty('--accent-text', readableAccent(hex, document.documentElement.dataset.theme));
}
let lastAccent = '#34d6a0';

/** Vibración suave donde existe (Android). iOS no la permite desde la web. */
export const haptic = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* sin soporte */ } };

// ---------- sonidos (sintetizados, sin archivos) ----------
export const soundOn = () => { try { return localStorage.getItem('lindwyrm.sound') !== '0'; } catch { return true; } };
export const setSoundOn = (on) => { try { localStorage.setItem('lindwyrm.sound', on ? '1' : '0'); } catch { /* sin storage */ } };
let audio = null;
/** Sonidito de “me gusta”: dos notas suaves que suben, con un brillo al final. Se llama desde un toque (iOS lo exige). */
export function playLike() {
  if (!soundOn()) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + 0.01;
    const note = (freq, at, dur, vol, type = 'sine') => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0 + at);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(audio.destination);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    };
    note(784, 0, 0.32, 0.16);          // sol
    note(1175, 0.11, 0.42, 0.15);      // re agudo
    note(1568, 0.2, 0.55, 0.07, 'triangle'); // brillo
  } catch { /* sin audio */ }
}
