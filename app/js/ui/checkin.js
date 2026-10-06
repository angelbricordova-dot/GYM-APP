import { html, useState, useRef, useEffect } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { processImage } from '../photos.js';
import { Icon, Flame, Confetti, CountUp, toast, cx } from './kit.js';
import { closeScreen } from './nav.js';

/**
 * Foto de salida: se toma al terminar, frente al espejo. Es lo que activa la racha del día.
 * Se guarda en el teléfono al instante; sube sola cuando hay señal.
 */
export function CheckIn({ session }) {
  const input = useRef();
  const [blob, setBlob] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const me = S.state.me;
  const already = !!me.checkins[L.ymd()];

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const b = await processImage(file, { max: 1080, quality: 0.8 });
      setBlob(b);
      setPreview(URL.createObjectURL(b));
    } catch {
      toast('No pude leer esa foto. Intenta con otra.', { icon: '⚠️' });
    }
    setBusy(false);
  };

  const confirm = async () => {
    setBusy(true);
    const before = { streak: L.streakInfo(me).current, tokens: L.balance(me), longest: L.streakInfo(me).longest };
    await S.checkIn({ blob, sessionId: session?.id });
    const now = S.state.me;
    const after = L.streakInfo(now);
    setDone({ before, streak: after.current, tokens: L.balance(now), newBest: after.current > before.longest && after.current > 1 });
    setBusy(false);
  };

  if (done) return html`<${Celebration} done=${done} onClose=${closeScreen} />`;

  return html`<div class="screen checkin">
    <div class="screen-top"><button class="icon-btn" onClick=${closeScreen} aria-label="Cerrar"><${Icon} name="x" size=${20} /></button><b>Foto de salida</b><span></span></div>
    <div class="screen-body center-col">
      ${session && html`<div class="ci-sum"><b>¡Entreno guardado!</b><span>${session.exercises.length} ejercicios · ${L.sessionSets(session)} series</span></div>`}
      <h1 class="ci-title">${preview ? '¿Así se queda?' : 'Tómate la foto del espejo'}</h1>
      <p class="muted center">${preview ? 'Esta foto la verán solo ustedes dos.' : `Es lo que enciende tu racha${already ? ' (hoy ya tienes una; esta la reemplaza)' : ''}.`}</p>
      <button class=${cx('shot', preview && 'has')} onClick=${() => input.current.click()} disabled=${busy} aria-label=${preview ? 'Cambiar foto' : 'Tomar foto'}>
        ${preview ? html`<img src=${preview} alt="Vista previa" />` : html`<div class="shot-empty"><${Icon} name="camera" size=${40} sw=${1.5} /><span>Toca para abrir la cámara</span></div>`}
      </button>
      <input ref=${input} type="file" accept="image/*" hidden onChange=${onFile} />
      <div class="stack w100">
        <button class="btn primary block lg" disabled=${!blob || busy} onClick=${confirm}>${busy ? 'Guardando…' : html`<${Flame} size=${22} /> Activar mi racha`}</button>
        ${preview && html`<button class="btn block" onClick=${() => input.current.click()}>Repetir foto</button>`}
        <button class="link" onClick=${() => { toast(session ? 'Entreno guardado sin foto: no cuenta para la racha' : 'Sin foto no hay racha'); closeScreen(); }}>Ahora no</button>
      </div>
    </div>
  </div>`;
}

function Celebration({ done, onClose }) {
  const gain = done.tokens - done.before.tokens;
  const milestone = L.MILESTONES[done.streak];
  const partner = S.state.partner?.name;
  return html`<div class="screen celebrate">
    <${Confetti} />
    <div class="cel-flame"><div class="halo"></div><${Flame} size=${150} /></div>
    <div class="cel-num"><${CountUp} value=${done.streak} /></div>
    <h1>${done.streak === 1 ? 'racha iniciada' : 'días de racha'}</h1>
    <p class="muted center">${done.newBest ? '🏆 ¡Nueva mejor racha!' : done.streak > done.before.streak ? '¡Un día más, sigue así!' : 'Foto actualizada'}${partner ? ` · ${partner} lo verá` : ''}</p>
    <div class="cel-chips">
      ${gain > 0 && html`<span class="chip gold">+${gain} puntos de amor</span>`}
      ${milestone && html`<span class="chip ember">Hito de ${done.streak} días</span>`}
    </div>
    <button class="btn primary block lg cel-btn" onClick=${onClose}>Listo</button>
  </div>`;
}
