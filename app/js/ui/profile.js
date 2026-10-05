import { html, useState, useRef } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { processImage, toDataURL } from '../photos.js';
import { Icon, Avatar, Stepper, Field, toast, cx } from './kit.js';
import { closeScreen } from './nav.js';

export function Profile() {
  const me = S.state.me;
  const file = useRef();
  const [name, setName] = useState(me.name);
  const [height, setHeight] = useState(me.heightCm ?? '');
  const paused = L.isPaused(me);

  const pickAvatar = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const blob = await processImage(f, { square: 256, quality: 0.82 });
      S.profile({ avatar: await toDataURL(blob) });
      toast('Foto de perfil actualizada', { icon: '📸' });
    } catch { toast('No pude leer esa foto', { icon: '⚠️' }); }
  };

  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: 'application/json' }));
    a.download = `gym-duo-respaldo-${L.ymd()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return html`<div class="screen profile" style=${`--accent:${me.color}`}>
    <div class="screen-top"><button class="icon-btn" onClick=${closeScreen} aria-label="Volver"><${Icon} name="left" size=${20} /></button><b>Mi perfil</b><span></span></div>
    <div class="screen-body">
      <div class="avatar-edit">
        <button onClick=${() => file.current.click()} aria-label="Cambiar foto de perfil"><${Avatar} doc=${me} size=${104} ring /><span class="cam"><${Icon} name="camera" size=${16} /></span></button>
        <input ref=${file} type="file" accept="image/*" hidden onChange=${pickAvatar} />
        ${me.avatar && html`<button class="link" onClick=${() => S.profile({ avatar: null })}>Quitar foto</button>`}
      </div>

      <section class="card">
        <${Field} label="Nombre"><input value=${name} maxlength="20" onInput=${(e) => setName(e.target.value)} onBlur=${() => name.trim() && S.profile({ name: name.trim() })} /><//>
        <div class="field"><span>Color</span><div class="swatches">${L.ACCENTS.map((c) => html`<button class=${cx('sw', me.color === c && 'on')} style=${`--c:${c}`} onClick=${() => S.profile({ color: c })} aria-label=${`Color ${c}`}></button>`)}</div></div>
        <${Field} label="Estatura (cm)"><input inputmode="decimal" value=${height} onInput=${(e) => setHeight(e.target.value)} onBlur=${() => S.profile({ heightCm: L.num(height) || null })} placeholder="170" /><//>
      </section>

      <section class="card">
        <h2>Metas</h2>
        <div class="set-line"><div><b>Días de gym por semana</b><small class="muted">Tu meta semanal</small></div><${Stepper} value=${me.weeklyGoal} onChange=${(v) => S.profile({ weeklyGoal: Math.max(1, Math.min(7, Math.round(L.num(v)) || 1)) })} min=${1} label="Días por semana" /></div>
        <div class="set-line"><div><b>Descansos que aguanta tu racha</b><small class="muted">Días seguidos sin ir antes de que se rompa</small></div><${Stepper} value=${me.restDays} onChange=${(v) => S.profile({ restDays: Math.max(0, Math.min(4, Math.round(L.num(v)))) })} label="Días de descanso" /></div>
        <div class="set-line"><div><b>Agua al día (ml)</b><small class="muted">Meta diaria</small></div><${Stepper} value=${me.waterGoalMl} onChange=${(v) => S.profile({ waterGoalMl: Math.max(500, Math.round(L.num(v)) || 2000) })} step=${250} label="Mililitros" /></div>
      </section>

      <section class="card">
        <h2>Privacidad y pausa</h2>
        <label class="switch-row"><div><b>Compartir mi peso corporal</b><small class="muted">Por defecto tu pareja no lo ve</small></div><input type="checkbox" checked=${me.shareWeight} onChange=${(e) => S.profile({ shareWeight: e.target.checked })} /></label>
        <div class="set-line"><div><b>${paused ? 'Racha en pausa' : 'Pausar mi racha'}</b><small class="muted">Enfermedad, lesión o viaje: no se rompe mientras dure</small></div>
          <button class=${cx('btn sm', !paused && 'ghost')} onClick=${() => (paused ? S.endPause() : confirm('¿Pausar tu racha hasta que la reanudes?') && S.startPause())}>${paused ? 'Reanudar' : 'Pausar'}</button></div>
      </section>

      <section class="card">
        <h2>Cuenta</h2>
        <button class="btn block" onClick=${exportData}>Descargar mis datos</button>
        <button class="btn block danger" onClick=${() => { if (confirm('¿Cerrar sesión en este teléfono? Tus datos siguen guardados en la nube.')) { closeScreen(); S.logout(); } }}><${Icon} name="logout" size=${18} /> Cerrar sesión</button>
        <p class="muted small center">Gym Duo · ${S.net.online ? 'Conectado' : 'Sin conexión'}${S.state.dirty ? ' · cambios por sincronizar' : ' · todo sincronizado'}</p>
      </section>
    </div>
  </div>`;
}

/** Primer arranque: estatura, peso y meta (se puede saltar). */
export function Onboarding({ onClose }) {
  const [f, setF] = useState({ height: '', weight: '', goal: '3' });
  const finish = (skip) => {
    S.update((me) => {
      me.onboarded = true;
      if (!skip) {
        me.heightCm = L.num(f.height) || null;
        me.weeklyGoal = Math.max(1, Math.min(7, Math.round(L.num(f.goal)) || 3));
        if (L.num(f.weight)) me.weights.push({ date: L.ymd(), kg: L.num(f.weight) });
      }
    });
    onClose();
  };
  return html`<div class="screen onboarding">
    <div class="screen-body center-col">
      <div class="logo-flame"><${Icon} name="bolt" size=${40} /></div>
      <h1>Cuéntanos de ti</h1>
      <p class="muted center">Solo para calcular tu progreso. Tu peso es privado.</p>
      <div class="stack w100">
        <div class="row2"><${Field} label="Estatura (cm)"><input inputmode="decimal" value=${f.height} onInput=${(e) => setF({ ...f, height: e.target.value })} placeholder="170" /><//><${Field} label="Peso (kg)"><input inputmode="decimal" value=${f.weight} onInput=${(e) => setF({ ...f, weight: e.target.value })} placeholder="70" /><//></div>
        <${Field} label="¿Cuántos días a la semana quieres ir?"><${Stepper} value=${f.goal} onChange=${(v) => setF({ ...f, goal: v })} min=${1} label="Días por semana" /><//>
        <button class="btn primary block lg" onClick=${() => finish(false)}>Empezar</button>
        <button class="link" onClick=${() => finish(true)}>Saltar por ahora</button>
      </div>
    </div>
  </div>`;
}
