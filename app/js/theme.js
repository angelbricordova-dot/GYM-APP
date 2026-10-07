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
/**
 * Sonido de “me gusta”: una campanita suave y cálida (estilo confirmación de la App Store), no un bip de videojuego.
 * Dos notas de “vidrio” (sol y re agudos) hechas con parciales de campana que se apagan despacio, un filtro que quita lo áspero y un eco corto.
 * `out` es el destino (en pruebas, un contexto sin conexión).
 */
export function likeSound(ctx, out, t0, notes = [[784, 0, 0.17, 1.1], [1174.7, 0.085, 0.14, 1.4]]) {
  const tone = ctx.createGain();
  tone.gain.value = 0.9;
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass'; soften.frequency.value = 5200; soften.Q.value = 0.4;
  const echo = ctx.createDelay(0.5), fb = ctx.createGain(), wet = ctx.createGain();
  echo.delayTime.value = 0.11; fb.gain.value = 0.3; wet.gain.value = 0.22;
  tone.connect(soften); soften.connect(out);
  soften.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(out);
  // campana: fundamental + parciales (2.0, 3.0, 4.2) que decaen más rápido cuanto más agudos
  const bell = (freq, at, vol, decay) => {
    for (const [mult, amp, dec] of [[1, 1, 1], [2, 0.32, 0.6], [3, 0.12, 0.4], [4.2, 0.05, 0.25]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(freq * mult, t0 + at);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol * amp, t0 + at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + decay * dec);
      o.connect(g); g.connect(tone);
      o.start(t0 + at); o.stop(t0 + at + decay * dec + 0.05);
    }
  };
  for (const [freq, at, vol, decay] of notes) bell(freq, at, vol, decay); // por defecto: sol y re (quinta arriba), el “ting” que sube
}

/** Avisito de “llegó algo de tu pareja” con la app abierta: una sola campanita, más suave que el like. */
export function playPing() {
  if (!soundOn()) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    likeSound(audio, audio.destination, audio.currentTime + 0.01, [[1318.5, 0, 0.11, 0.9]]);
  } catch { /* sin audio */ }
}

/** El AudioContext se crea con el primer toque (iOS exige un gesto) y de una vez se descarga el sonido del like. */
export function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    loadLike(audio);
  } catch { /* sin audio */ }
}

// El sonido del like es el archivo /sounds/like.mp3 (tiene silencio al inicio: se recorta al primer sonido audible y se sube de volumen).
let likeSample = null;
let likeLoading = null;
function loadLike(ctx) {
  if (likeSample) return Promise.resolve(likeSample);
  likeLoading = likeLoading || fetch('/sounds/like.mp3').then((r) => r.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)).then((buf) => {
    const d = buf.getChannelData(0);
    let first = 0, peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak * 0.04) { first = i / buf.sampleRate; break; }
    likeSample = { buf, start: Math.max(0, first - 0.01), gain: Math.min(3, 0.55 / (peak || 1)) };
    return likeSample;
  }).catch(() => null);
  return likeLoading;
}

export async function playLike() {
  if (!soundOn()) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const s = await loadLike(audio);
    if (!s) return likeSound(audio, audio.destination, audio.currentTime + 0.01); // sin el archivo: campanita sintetizada
    const src = audio.createBufferSource(), g = audio.createGain();
    src.buffer = s.buf; g.gain.value = s.gain;
    src.connect(g); g.connect(audio.destination);
    src.start(0, s.start);
  } catch { /* sin audio */ }
}
