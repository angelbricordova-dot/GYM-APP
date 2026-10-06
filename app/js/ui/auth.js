import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import { Icon, Field, toast, cx } from './kit.js';
import { GoogleButton } from './google-button.js';

// Entrada: crear el espacio de la pareja, unirse con código o entrar. Con Google o con nombre + PIN.
export function Auth() {
  const [mode, setMode] = useState('welcome'); // welcome | setup | join | login | invite
  const [info, setInfo] = useState(null); // estado del servidor
  const [f, setF] = useState({ name: '', pin: '', code: '', setupCode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => { S.getStatus().then((r) => (r.ok ? setInfo(r.data) : setInfo({ offline: true }))); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const done = (res) => {
    setBusy(false);
    if (!res.ok) return setError(res.data.error || 'Algo salió mal.');
    if (mode === 'setup') { setCreated(res); setMode('invite'); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    done(mode === 'setup'
      ? await S.createSpace({ name: f.name, pin: f.pin, setupCode: f.setupCode })
      : mode === 'join'
        ? await S.joinSpace({ name: f.name, pin: f.pin, inviteCode: f.code })
        : await S.login({ name: f.name, pin: f.pin }));
  };

  const withGoogle = async (credential) => {
    setError('');
    if (mode === 'join' && !f.code.trim()) return setError('Escribe primero el código de invitación.');
    setBusy(true);
    done(mode === 'setup'
      ? await S.googleSetup({ credential, name: f.name, setupCode: f.setupCode })
      : mode === 'join'
        ? await S.googleJoin({ credential, name: f.name, inviteCode: f.code })
        : await S.googleLogin(credential));
  };

  const invite = created?.data.inviteCode || '';
  if (mode === 'invite') return html`<${Shell}>
    <h1>¡Espacio creado!</h1>
    <p class="lead">Pásale este código a tu pareja para que se una. Solo sirve una vez.</p>
    <div class="invite-code">${invite.split('').map((c) => html`<span>${c}</span>`)}</div>
    <div class="row-btns">
      <button class="btn tinted" onClick=${() => { navigator.clipboard?.writeText(invite); toast('Código copiado', { icon: '📋' }); }}><${Icon} name="copy" size=${18} /> Copiar</button>
      ${navigator.share && html`<button class="btn tinted" onClick=${() => navigator.share({ text: `Únete a nuestro Lindwyrm con el código ${invite}` }).catch(() => {})}><${Icon} name="send" size=${18} /> Compartir</button>`}
    </div>
    <p class="muted small center">Lo verás de nuevo en la pestaña Juntos mientras ella o él no se una.</p>
    <button class="btn primary block lg" onClick=${() => S.beginSession(created)}>Continuar</button>
  <//>`;

  if (mode === 'welcome') return html`<${Shell} hero>
    <h1>Lindwyrm</h1>
    <p class="lead">Entrenen juntos, sigan su racha y ganen puntos de amor. Una app privada solo para ustedes dos.</p>
    ${info?.offline && html`<p class="notice">No pude conectar con el servidor. Revisa tu internet.</p>`}
    <div class="stack">
      ${info && !info.setup && html`<button class="btn primary block lg" onClick=${() => setMode('setup')}>Crear nuestro espacio</button>`}
      ${info?.setup && !info.full && html`<button class="btn primary block lg" onClick=${() => setMode('join')}>Unirme con código</button>`}
      ${info?.setup && html`<button class=${cx('btn block lg', info.full ? 'primary' : 'tinted')} onClick=${() => setMode('login')}>Ya tengo cuenta · Entrar</button>`}
      ${!info && html`<div class="spinner"></div>`}
    </div>
  <//>`;

  const titles = { setup: 'Crea tu perfil', join: 'Únete con tu código', login: 'Bienvenido de vuelta' };
  const google = info?.googleClientId;
  const gText = mode === 'login' ? 'signin_with' : 'continue_with';
  return html`<${Shell}>
    <button class="back" onClick=${() => { setMode('welcome'); setError(''); }}><${Icon} name="left" size=${20} /> Atrás</button>
    <h1>${titles[mode]}</h1>
    ${mode === 'join' && html`<${Field} label="Código de invitación"><input value=${f.code} onInput=${set('code')} maxlength="8" autocapitalize="characters" autocomplete="off" class="code-input" /><//>`}
    ${mode === 'setup' && info?.needsSetupCode && html`<${Field} label="Código de configuración" hint="Es el valor de SETUP_CODE en Netlify."><input value=${f.setupCode} onInput=${set('setupCode')} autocomplete="off" /><//>`}
    ${google && html`<${GoogleButton} clientId=${google} onCredential=${withGoogle} text=${gText} key=${mode} />${html`<div class="or"><span>o con nombre y PIN</span></div>`}`}
    <form class="stack" onSubmit=${submit}>
      <${Field} label="Tu nombre"><input value=${f.name} onInput=${set('name')} maxlength="20" autocomplete="username" autocapitalize="words" required /><//>
      <${Field} label=${mode === 'login' ? 'Tu PIN' : 'Elige un PIN (4 a 8 números)'} hint=${mode !== 'login' ? 'Lo usarás para entrar desde otro teléfono.' : ''}>
        <input type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" value=${f.pin} onInput=${set('pin')} autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} required />
      <//>
      ${error && html`<p class="notice" role="alert">${error}</p>`}
      <button class="btn primary block lg" disabled=${busy}>${busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : mode === 'join' ? 'Unirme' : 'Crear espacio'}</button>
    </form>
  <//>`;
}

const Shell = ({ children, hero }) => html`<div class=${cx('auth', hero && 'hero')}>
  <div class="glow g1"></div><div class="glow g2"></div>
  <div class="auth-in">${hero && html`<div class="logo-mark big"><${Icon} name="heart" size=${44} fill /></div>`}${children}</div>
</div>`;
