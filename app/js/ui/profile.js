import { html, useState, useRef, useEffect } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { getTheme, setTheme, accentVars } from '../theme.js';
import { Icon, Sheet, Avatar, Stepper, Field, Segmented, toast, cx } from './kit.js';
import { pushSupport, currentSubscription, enablePush, disablePush, setPrefs, sendTest } from '../push.js';
import { GoogleButton } from './google-button.js';
import { AvatarCropper } from './cropper.js';
import { closeScreen } from './nav.js';

/** Mi perfil: ajustes agrupados como en iOS. */
export function Profile() {
  const me = S.state.me;
  const acc = S.state.account || {};
  const file = useRef();
  const [name, setName] = useState(me.name);
  const [height, setHeight] = useState(me.heightCm ?? '');
  const [theme, setThemeState] = useState(getTheme());
  const [googleId, setGoogleId] = useState(null);
  const [pin, setPin] = useState('');
  const paused = L.isPaused(me);
  useEffect(() => { S.getStatus().then((r) => r.ok && setGoogleId(r.data.googleClientId)); }, []);

  const [cropFile, setCropFile] = useState(null);
  const pickAvatar = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) setCropFile(f); // se encuadra antes de guardarla
  };

  const [danger, setDanger] = useState(null); // 'reset' | 'delete'

  const link = async (credential) => {
    const r = await S.linkGoogle(credential);
    toast(r.ok ? 'Cuenta de Google vinculada' : r.data.error, { icon: r.ok ? '✅' : '⚠️' });
  };
  const savePin = async () => {
    const r = await S.setPin(pin);
    toast(r.ok ? 'PIN guardado' : r.data.error, { icon: r.ok ? '🔒' : '⚠️' });
    if (r.ok) setPin('');
  };

  return html`<div class="screen profile" style=${accentVars(me.color)}>
    <div class="screen-top"><button class="icon-btn" onClick=${closeScreen} aria-label="Volver"><${Icon} name="left" size=${20} /></button><b>Mi perfil</b><span></span></div>
    <div class="screen-body">
      <div class="avatar-edit">
        <button onClick=${() => file.current.click()} aria-label="Cambiar foto de perfil"><${Avatar} doc=${me} size=${104} ring /><span class="cam-badge"><${Icon} name="camera" size=${16} /></span></button>
        <input ref=${file} type="file" accept="image/*" hidden onChange=${pickAvatar} />
        ${cropFile && html`<${AvatarCropper} file=${cropFile} onClose=${() => setCropFile(null)} onDone=${(data) => { S.profile({ avatar: data }); setCropFile(null); toast('Foto de perfil actualizada', { icon: '📸' }); }} />`}
        <b class="avatar-name">${me.name}</b>
        ${me.avatar && html`<button class="link" onClick=${() => S.profile({ avatar: null })}>Quitar foto</button>`}
      </div>

      <h3 class="sec-h">Apariencia</h3>
      <div class="group pad">
        <${Segmented} value=${theme} onChange=${(t) => { setTheme(t); setThemeState(t); }} options=${[{ id: 'auto', label: 'Automático' }, { id: 'light', label: 'Día' }, { id: 'dark', label: 'Noche' }]} />
        <${ColorPicker} value=${me.color} onChange=${(c) => S.profile({ color: c })} />
      </div>
      <p class="sec-f">Automático sigue el modo de tu teléfono. Tu color se ve en tu perfil, tus botones y en tus notas.</p>

      <h3 class="sec-h">Tus datos</h3>
      <div class="group pad stack">
        <${Field} label="Nombre"><input value=${name} maxlength="20" onInput=${(e) => setName(e.target.value)} onBlur=${() => name.trim() && S.profile({ name: name.trim() })} /><//>
        <${Field} label="Estatura (cm)"><input inputmode="decimal" value=${height} onInput=${(e) => setHeight(e.target.value)} onBlur=${() => S.profile({ heightCm: L.num(height) || null })} placeholder="170" /><//>
      </div>

      <h3 class="sec-h">Metas</h3>
      <div class="group">
        <div class="row static"><div class="grow"><b>Días de gym por semana</b><small class="muted">Tu meta semanal</small></div><${Stepper} value=${me.weeklyGoal} onChange=${(v) => S.profile({ weeklyGoal: Math.max(1, Math.min(7, Math.round(L.num(v)) || 1)) })} min=${1} label="Días por semana" /></div>
        <div class="row static"><div class="grow"><b>Descansos que aguanta tu racha</b><small class="muted">Días seguidos sin ir antes de que se rompa</small></div><${Stepper} value=${me.restDays} onChange=${(v) => S.profile({ restDays: Math.max(0, Math.min(4, Math.round(L.num(v)))) })} label="Días de descanso" /></div>
      </div>

      <h3 class="sec-h">Privacidad y pausa</h3>
      <div class="group">
        <label class="row switch-row"><div class="grow"><b>Compartir mi peso corporal</b><small class="muted">Por defecto tu pareja no lo ve</small></div><input type="checkbox" checked=${me.shareWeight} onChange=${(e) => S.profile({ shareWeight: e.target.checked })} /></label>
        <div class="row static"><div class="grow"><b>${paused ? 'Racha en pausa' : 'Pausar mi racha'}</b><small class="muted">Enfermedad, lesión o viaje: no se rompe mientras dure</small></div>
          <button class=${cx('btn tinted sm')} onClick=${() => (paused ? S.endPause() : confirm('¿Pausar tu racha hasta que la reanudes?') && S.startPause())}>${paused ? 'Reanudar' : 'Pausar'}</button></div>
      </div>

      <h3 class="sec-h">Notificaciones</h3>
      <${Notifications} acc=${acc} />

      <h3 class="sec-h">Cuenta</h3>
      <div class="group pad stack">
        <div class="acct"><span class="lead"><${Icon} name="lock" size=${18} /></span><div class="grow"><b>Google</b><small class="muted">${acc.google ? `Vinculada${acc.email ? ` · ${acc.email}` : ''}` : googleId ? 'Vincula tu cuenta para entrar con un toque' : 'No disponible: falta configurar GOOGLE_CLIENT_ID en Netlify'}</small></div></div>
        ${!acc.google && googleId && html`<${GoogleButton} clientId=${googleId} onCredential=${link} text="continue_with" />`}
        <${Field} label=${acc.hasPin ? 'Cambiar PIN (4 a 8 números)' : 'Crear un PIN (4 a 8 números)'} hint="Sirve para entrar desde otro teléfono sin Google.">
          <div class="inline"><input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" value=${pin} onInput=${(e) => setPin(e.target.value)} /><button class="btn tinted" disabled=${pin.length < 4} onClick=${savePin}>Guardar</button></div>
        <//>
      </div>
      <div class="group">
        <button class="row" onClick=${downloadData}><span class="lead"><${Icon} name="copy" size=${18} /></span><div class="grow"><b>Descargar mis datos</b></div></button>
        <button class="row danger" onClick=${() => { if (confirm('¿Cerrar sesión en este teléfono? Tus datos siguen guardados en la nube.')) { closeScreen(); S.logout(); } }}><span class="lead"><${Icon} name="logout" size=${18} /></span><div class="grow"><b>Cerrar sesión</b></div></button>
      </div>
      <h3 class="sec-h">Zona de peligro</h3>
      <div class="group">
        <button class="row danger" onClick=${() => setDanger('reset')}><span class="lead"><${Icon} name="history" size=${18} /></span><div class="grow"><b>Reiniciar de cero</b><small class="muted">Borra todo tu progreso y empieza otra vez</small></div><${Icon} name="right" size=${16} class="chev" /></button>
        <button class="row danger" onClick=${() => setDanger('delete')}><span class="lead"><${Icon} name="trash" size=${18} /></span><div class="grow"><b>Eliminar mi usuario</b><small class="muted">Borra tu cuenta y todo lo que creaste</small></div><${Icon} name="right" size=${16} class="chev" /></button>
      </div>
      ${danger && html`<${DangerSheet} kind=${danger} onClose=${() => setDanger(null)} />`}
      <p class="sec-f center">Lindwyrm · ${S.net.online ? 'Conectado' : 'Sin conexión'}${S.state.dirty ? ' · cambios por sincronizar' : ' · todo sincronizado'}</p>
    </div>
  </div>`;
}

/** 24 colores + cualquier color libre. */
function ColorPicker({ value, onChange }) {
  const custom = !L.PALETTE.some((c) => c.toLowerCase() === value.toLowerCase());
  return html`<div class="colors" role="radiogroup" aria-label="Color de acento">
    ${L.PALETTE.map((c) => html`<button class=${cx('sw', c.toLowerCase() === value.toLowerCase() && 'on')} style=${`--c:${c}`} role="radio" aria-checked=${c.toLowerCase() === value.toLowerCase()} aria-label=${`Color ${c}`} onClick=${() => onChange(c)}></button>`)}
    <label class=${cx('sw custom', custom && 'on')} style=${`--c:${value}`} aria-label="Color personalizado">
      <span>${custom ? '' : html`<${Icon} name="plus" size=${16} sw=${2.6} />`}</span>
      <input type="color" value=${value} onInput=${(e) => onChange(e.target.value.toUpperCase())} />
    </label>
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
    <div class="screen-body center-col"><div class="ob-in">
      <div class="logo-mark"><${Icon} name="heart" size=${40} fill /></div>
      <h1>Cuéntanos de ti</h1>
      <p class="muted center">Solo para calcular tu progreso. Tu peso es privado.</p>
      <div class="stack w100">
        <div class="row2"><${Field} label="Estatura (cm)"><input inputmode="decimal" value=${f.height} onInput=${(e) => setF({ ...f, height: e.target.value })} placeholder="170" /><//><${Field} label="Peso (kg)"><input inputmode="decimal" value=${f.weight} onInput=${(e) => setF({ ...f, weight: e.target.value })} placeholder="70" /><//></div>
        <${Field} label="¿Cuántos días a la semana quieres ir?"><${Stepper} value=${f.goal} onChange=${(v) => setF({ ...f, goal: v })} min=${1} label="Días por semana" /><//>
        <button class="btn primary block lg" onClick=${() => finish(false)}>Empezar</button>
        <button class="link" onClick=${() => finish(true)}>Saltar por ahora</button>
      </div>
    </div></div>
  </div>`;
}

function downloadData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: 'application/json' }));
  a.download = `lindwyrm-respaldo-${L.ymd()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ============ notificaciones ============
const KINDS = [
  ['challenges', 'Retos', 'Te retan, envían evidencia o la aprueban'],
  ['notes', 'Notas y corazones', 'Mensajes de ánimo de tu pareja'],
  ['workouts', 'Entrenos de tu pareja', 'Cuando termina su entreno del día'],
  ['routines', 'Rutinas', 'Te recomiendan una rutina'],
  ['prizes', 'Premios', 'Ideas, contraofertas y canjes'],
];

function Notifications({ acc }) {
  const sup = pushSupport();
  const prefs = acc.push?.prefs || { challenges: true, notes: true, workouts: true, routines: true, prizes: true, reminder: false, reminderHour: 18 };
  const [on, setOn] = useState(null); // este teléfono está suscrito
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentSubscription().then((s) => setOn(!!s && Notification.permission === 'granted')).catch(() => setOn(false)); }, []);

  if (sup.needsInstall) {
    return html`<div class="group pad"><b>Instala la app para recibir avisos</b>
      <p class="muted small">En iPhone las notificaciones solo funcionan con Lindwyrm en la pantalla de inicio: en Safari toca <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>, ábrela desde su icono y vuelve aquí. Necesitas iOS 16.4 o más reciente.</p></div>`;
  }
  if (!sup.supported) return html`<div class="group pad"><b>No disponible aquí</b><p class="muted small">Este navegador no admite notificaciones push.</p></div>`;

  const toggle = async (e) => {
    const want = e.target.checked;
    setOn(want); // optimista: se mueve al instante y se revierte si el teléfono dice que no
    setBusy(true);
    if (want) {
      const r = await enablePush();
      setOn(r.ok);
      if (!r.ok) toast(r.error, { icon: '⚠️' }); else toast('Notificaciones activadas', { icon: '🔔' });
    } else await disablePush();
    setBusy(false);
  };
  const test = async () => { const r = await sendTest(); toast(r.ok ? 'Enviada: debería llegarte en segundos' : r.data.error, { icon: r.ok ? '🔔' : '⚠️' }); };
  const hour = prefs.reminderHour;

  return html`<div class="group">
    <label class="row switch-row"><div class="grow"><b>En este teléfono</b><small class="muted">${sup.permission === 'denied' ? 'Bloqueadas: actívalas en Ajustes → Lindwyrm → Notificaciones' : on ? 'Activadas' : 'Recibe avisos de tu pareja'}</small></div><input type="checkbox" checked=${!!on} disabled=${busy || sup.permission === 'denied'} onChange=${toggle} /></label>
    ${on && html`
      ${KINDS.map(([k, title, sub]) => html`<label class="row switch-row"><div class="grow"><b>${title}</b><small class="muted">${sub}</small></div><input type="checkbox" checked=${prefs[k]} onChange=${(e) => setPrefs({ [k]: e.target.checked })} /></label>`)}
      <label class="row switch-row"><div class="grow"><b>Recordatorio diario</b><small class="muted">Si aún no entrenaste, te aviso a esta hora</small></div><input type="checkbox" checked=${prefs.reminder} onChange=${(e) => setPrefs({ reminder: e.target.checked })} /></label>
      ${prefs.reminder && html`<div class="row static"><div class="grow"><b>Hora del recordatorio</b><small class="muted">${String(hour).padStart(2, '0')}:00 (hora de tu teléfono)</small></div><${Stepper} value=${hour} onChange=${(v) => setPrefs({ reminderHour: Math.max(0, Math.min(23, Math.round(L.num(v)))) })} label="Hora" /></div>`}
      <button class="row" onClick=${test}><span class="lead"><${Icon} name="send" size=${18} /></span><div class="grow"><b>Enviar una notificación de prueba</b></div></button>`}
  </div>`;
}

// ============ reiniciar y eliminar ============
const COPY = {
  reset: {
    title: 'Reiniciar de cero', word: 'REINICIAR', cta: 'Borrar todo mi progreso',
    lose: ['Todos tus entrenos y ejercicios', 'Tu racha, check-ins y fotos del espejo', 'Tu peso registrado y tus puntos de amor', 'Tus rutinas y pausas'],
    keep: ['Tu cuenta, nombre, foto de perfil y color', 'Tus metas y ajustes', 'Tu pareja, sus datos y las notas del tablero'],
  },
  delete: {
    title: 'Eliminar mi usuario', word: 'ELIMINAR', cta: 'Eliminar mi cuenta para siempre',
    lose: ['Tu cuenta, tu PIN y tu vínculo con Google', 'Todo tu progreso, fotos y puntos', 'Tus notas, retos, rutinas y premios propuestos', 'Tu lugar en el espacio: tu pareja se queda sola con un código nuevo'],
    keep: [],
  },
};

function DangerSheet({ kind, onClose }) {
  const c = COPY[kind];
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = typed.trim().toUpperCase() === c.word;
  const go = async () => {
    setBusy(true);
    const r = kind === 'reset' ? await S.resetProgress() : await S.deleteAccount();
    setBusy(false);
    if (!r.ok) return toast(r.data.error || 'No se pudo completar. Revisa tu conexión.', { icon: '⚠️' });
    if (kind === 'reset') { toast('Listo: empiezas de cero', { icon: '🌱' }); onClose(); }
  };
  return html`<${Sheet} title=${c.title} onClose=${onClose}>
    <div class="danger-box"><b>Esto no se puede deshacer.</b></div>
    <h3 class="sec-h flush">Se borrará</h3>
    <ul class="bullets bad">${c.lose.map((t) => html`<li>${t}</li>`)}</ul>
    ${c.keep.length > 0 && html`<h3 class="sec-h flush">Se conserva</h3><ul class="bullets good">${c.keep.map((t) => html`<li>${t}</li>`)}</ul>`}
    <button class="btn tinted block" onClick=${downloadData}><${Icon} name="copy" size=${16} /> Descargar mis datos primero</button>
    <${Field} label=${`Para confirmar, escribe ${c.word}`}><input value=${typed} onInput=${(e) => setTyped(e.target.value)} autocapitalize="characters" autocomplete="off" placeholder=${c.word} /><//>
    <button class="btn danger-fill block lg" disabled=${!ok || busy} onClick=${go}>${busy ? 'Un momento…' : c.cta}</button>
    <button class="link" onClick=${onClose}>Cancelar</button>
  <//>`;
}
