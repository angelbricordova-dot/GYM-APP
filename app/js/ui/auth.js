import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import { pactOk, PACT_PHRASE } from '../logic.js';
import { shareInvite, copyInvite } from '../invite.js';
import { Icon, Heart, Field, cx } from './kit.js';
import { GoogleButton } from './google-button.js';

// Entrada: crear el espacio de la pareja, unirse (con enlace o código) o entrar. Con Google o con nombre + PIN.
// Para unirse hay que aceptar con una frase: es una promesa de a dos.
export function Auth() {
  const [mode, setMode] = useState('welcome'); // welcome | setup | join | login | invite | pact
  const [info, setInfo] = useState(null); // estado del servidor
  const [f, setF] = useState({ name: '', pin: '', code: S.state.pendingInvite || '', setupCode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [inviter, setInviter] = useState('');
  const [pending, setPending] = useState(null); // { kind: 'pin' } | { kind: 'google', credential }
  const [phrase, setPhrase] = useState('');
  const [rec, setRec] = useState({ names: null, name: '', pin: '', confirm: '', wipe: false }); // recuperar acceso
  const [link, setLink] = useState(null); // credencial de Google por vincular al entrar con PIN

  useEffect(() => {
    S.getStatus().then((r) => (r.ok ? setInfo(r.data) : setInfo({ offline: true })));
    const code = S.state.pendingInvite;
    if (code) {
      // Llegó por enlace: se abre “Únete” con el código ya escrito.
      S.checkInvite(code).then((r) => {
        if (r.ok) { setInviter(r.data.inviter); setMode('join'); } else setError(`Este enlace no sirve: ${r.data.error}`);
      });
    }
  }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const done = (res) => {
    setBusy(false);
    if (!res.ok) return setError(res.data.error || 'Algo salió mal.');
    if (mode === 'setup') { setCreated(res); setMode('invite'); }
  };

  /** Antes de unirse: se valida el código y se pasa a la pregunta. */
  const toPact = async (credential) => {
    setBusy(true); setError('');
    const r = await S.checkInvite(f.code);
    setBusy(false);
    if (!r.ok) return setError(r.data.error);
    setInviter(r.data.inviter);
    setPending(credential ? { kind: 'google', credential } : { kind: 'pin' });
    setPhrase('');
    setMode('pact');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'join') return toPact();
    setBusy(true); setError('');
    done(mode === 'setup'
      ? await S.createSpace({ name: f.name, pin: f.pin, setupCode: f.setupCode })
      : await S.login({ name: f.name, pin: f.pin, credential: link || undefined }));
  };

  const withGoogle = async (credential) => {
    setError('');
    if (mode === 'join') return f.code.trim() ? toPact(credential) : setError('Escribe primero el código de invitación.');
    setBusy(true);
    if (mode === 'setup') return done(await S.googleSetup({ credential, name: f.name, setupCode: f.setupCode }));
    const res = await S.googleLogin(credential);
    if (res.status === 404) { // Google válido pero sin vincular: se pide nombre y PIN una vez para vincularlo
      setBusy(false); setLink(credential); setMode('login');
      return setError('Ese Google todavía no está vinculado. Escribe tu nombre y PIN y toca Entrar: lo vinculo y la próxima vez entras solo con Google.');
    }
    done(res);
  };

  const accept = async () => {
    setBusy(true); setError('');
    const res = pending.kind === 'google'
      ? await S.googleJoin({ credential: pending.credential, name: f.name, inviteCode: f.code, pact: phrase })
      : await S.joinSpace({ name: f.name, pin: f.pin, inviteCode: f.code, pact: phrase });
    setBusy(false);
    if (!res.ok) { setError(res.data.error || 'Algo salió mal.'); setMode('join'); }
  };

  const refreshInfo = () => S.getStatus().then((r) => r.ok && setInfo(r.data));
  const openRecover = () => { setError(''); setRec({ names: null, name: '', pin: '', confirm: '', wipe: false }); setMode('recover'); };
  const recList = async () => {
    setBusy(true); setError('');
    const r = await S.recoverCall({ setupCode: f.setupCode, action: 'list' });
    setBusy(false);
    if (!r.ok) return setError(r.data.error || 'No se pudo verificar.');
    setRec({ ...rec, names: r.data.names, name: r.data.names[0] || '' });
  };
  const recPin = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    const r = await S.recoverPin({ setupCode: f.setupCode, name: rec.name, pin: rec.pin });
    setBusy(false);
    if (!r.ok) setError(r.data.error || 'Algo salió mal.');
  };
  const recWipe = async () => {
    setBusy(true); setError('');
    const r = await S.recoverCall({ setupCode: f.setupCode, action: 'wipe', confirm: rec.confirm });
    setBusy(false);
    if (!r.ok) return setError(r.data.error || 'Algo salió mal.');
    await refreshInfo();
    setMode('welcome');
  };

  if (mode === 'recover') return html`<${Shell}>
    <button class="back" onClick=${() => { setMode('login'); setError(''); }}><${Icon} name="left" size=${20} /> Atrás</button>
    <h1>Recuperar mi acceso</h1>
    ${!info?.needsSetupCode
      ? html`<p class="lead">Para recuperar el acceso hace falta el <b>código de configuración</b>, y esta app todavía no tiene uno. En Netlify abre <b>Site configuration → Environment variables</b>, crea <b>SETUP_CODE</b> con una palabra secreta, vuelve a desplegar (<b>Deploys → Trigger deploy</b>) y regresa aquí.</p>`
      : !rec.names
        ? html`<p class="lead">Escribe el código de configuración (el valor de SETUP_CODE en Netlify).</p>
          <${Field} label="Código de configuración"><input value=${f.setupCode} onInput=${set('setupCode')} autocomplete="off" autocapitalize="none" /><//>
          ${error && html`<p class="notice" role="alert">${error}</p>`}
          <button class="btn primary block lg" disabled=${!f.setupCode || busy} onClick=${recList}>${busy ? 'Un momento…' : 'Continuar'}</button>`
        : !rec.wipe
          ? html`<p class="lead">Elige quién eres y pon un PIN nuevo.</p>
            <form class="stack" onSubmit=${recPin}>
              <div class="chips">${rec.names.map((n) => html`<button type="button" class=${cx('chip pick', rec.name === n && 'on')} onClick=${() => setRec({ ...rec, name: n })}>${n}</button>`)}</div>
              <${Field} label="PIN nuevo (4 a 8 números)"><input type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" value=${rec.pin} onInput=${(e) => setRec({ ...rec, pin: e.target.value })} autocomplete="new-password" required /><//>
              ${error && html`<p class="notice" role="alert">${error}</p>`}
              <button class="btn primary block lg" disabled=${busy || !rec.name}>${busy ? 'Un momento…' : 'Guardar PIN y entrar'}</button>
            </form>
            <button class="link danger" onClick=${() => { setError(''); setRec({ ...rec, wipe: true }); }}>Mejor borrar todo y empezar de cero</button>`
          : html`<div class="skip-warn"><span>⚠️</span><p><b>Esto borra todo</b>: las cuentas de los dos, entrenos, fotos, puntos, notas y retos. No se puede deshacer. Después podrás crear el espacio de nuevo.</p></div>
            <${Field} label="Escribe BORRAR para confirmar"><input value=${rec.confirm} onInput=${(e) => setRec({ ...rec, confirm: e.target.value })} autocomplete="off" autocapitalize="characters" /><//>
            ${error && html`<p class="notice" role="alert">${error}</p>`}
            <button class="btn bad block lg" disabled=${busy || rec.confirm.trim().toUpperCase() !== 'BORRAR'} onClick=${recWipe}>${busy ? 'Borrando…' : 'Borrar todo'}</button>
            <button class="link" onClick=${() => setRec({ ...rec, wipe: false, confirm: '' })}>Cancelar</button>`}
  <//>`;

  const invite = created?.data.inviteCode || '';
  if (mode === 'invite') return html`<${Shell}>
    <h1>¡Espacio creado!</h1>
    <p class="lead">Invita a tu pareja con este enlace: abre la pantalla “Únete” con el código ya escrito.</p>
    <div class="invite-code">${invite.split('').map((c) => html`<span>${c}</span>`)}</div>
    <div class="row-btns">
      <button class="btn primary" onClick=${() => shareInvite(invite, created?.name || f.name)}><${Icon} name="send" size=${18} /> Compartir enlace</button>
      <button class="btn tinted" onClick=${() => copyInvite(invite)}><${Icon} name="copy" size=${18} /> Copiar</button>
    </div>
    <p class="muted small center">Lo verás de nuevo en Hoy y en Juntos mientras no se una.</p>
    <button class="btn primary block lg" onClick=${() => S.beginSession(created)}>Continuar</button>
  <//>`;

  if (mode === 'pact') return html`<${Shell}>
    <button class="back" onClick=${() => { setMode('join'); setError(''); }}><${Icon} name="left" size=${20} /> Atrás</button>
    <div class="pact">
      <div class="pact-heart"><${Heart} size=${44} /></div>
      <h1>${inviter} quiere preguntarte algo</h1>
      <div class="pact-card">
        <p class="pact-q">¿Te comprometes a mejorar conmigo en el gimnasio y en tus hábitos?</p>
        <p>Entrenar juntos, ponernos retos, celebrar cada racha y cada pequeño logro, motivarnos en los días pesados y cuidarnos el uno al otro. Un día a la vez, tú y yo.</p>
        <p class="pact-sign">— ${inviter} 💗</p>
      </div>
      <${Field} label="Si dices que sí, escribe:">
        <div class="pact-phrase">“${PACT_PHRASE}”</div>
        <input value=${phrase} onInput=${(e) => setPhrase(e.target.value)} placeholder="Escríbela aquí" autocapitalize="none" autocorrect="off" autocomplete="off" enterkeyhint="done" />
      <//>
      ${error && html`<p class="notice" role="alert">${error}</p>`}
      <button class=${cx('btn primary block lg', pactOk(phrase) && 'ready')} disabled=${!pactOk(phrase) || busy} onClick=${accept}>${busy ? 'Un momento…' : html`<${Heart} size=${18} /> Aceptar y unirme`}</button>
      <button class="link" onClick=${() => { setMode('welcome'); setError(''); }}>Todavía no</button>
    </div>
  <//>`;

  if (mode === 'exists') return html`<${Shell}>
    <button class="back" onClick=${() => setMode('welcome')}><${Icon} name="left" size=${20} /> Atrás</button>
    <h1>Ya hay un espacio creado</h1>
    <p class="lead">Lindwyrm es un espacio privado para dos personas y en esta app ya se creó uno${info?.full ? ' con sus dos integrantes' : ''}.</p>
    <div class="group">
      <div class="row static"><span class="lead tint-rose">🔑</span><div class="grow"><b>Si eres tú, el anfitrión</b><small class="muted">Entra con tu nombre y PIN (o con Google).</small></div></div>
      ${!info?.full && html`<div class="row static"><span class="lead tint-rose">💌</span><div class="grow"><b>Si te invitaron</b><small class="muted">Usa el enlace o el código de invitación.</small></div></div>`}
      <div class="row static"><span class="lead tint-rose">🌱</span><div class="grow"><b>Si quieres empezar de nuevo</b><small class="muted">Entra y usa Perfil → Eliminar mi usuario. Cuando no quede nadie, el espacio queda libre para crearse otra vez.</small></div></div>
    </div>
    ${info?.googleClientId && html`<${GoogleButton} clientId=${info.googleClientId} onCredential=${withGoogle} text="signin_with" key="exists" />`}
    ${error && html`<p class="notice" role="alert">${error}</p>`}
    <button class="btn primary block lg" onClick=${() => { setError(''); setMode('login'); }}>Entrar con nombre y PIN</button>
    <button class="link" onClick=${openRecover}>Olvidé mi nombre o mi PIN</button>
    ${!info?.full && html`<button class="btn tinted block lg" onClick=${() => { setError(''); setMode('join'); }}>Unirme con código</button>`}
  <//>`;

  if (mode === 'welcome') return html`<${Shell} hero>
    <h1>Lindwyrm</h1>
    <p class="lead">Entrenen juntos, sigan su racha y ganen puntos de amor. Una app privada solo para ustedes dos.</p>
    ${info?.offline && html`<p class="notice">No pude conectar con el servidor. Revisa tu internet.</p>`}
    ${error && html`<p class="notice" role="alert">${error}</p>`}
    <div class="stack">
      ${info && !info.setup && html`<button class="btn primary block lg" onClick=${() => setMode('setup')}>Crear cuenta · Crear nuestro espacio</button>`}
      ${info?.setup && html`<button class="btn tinted block lg" onClick=${() => { setError(''); setMode('exists'); }}>Crear cuenta nueva (anfitrión)</button>`}
      ${info?.setup && !info.full && html`<button class="btn primary block lg" onClick=${() => { setError(''); setMode('join'); }}>Unirme con código</button>`}
      ${info?.setup && html`<button class=${cx('btn block lg', info.full ? 'primary' : 'tinted')} onClick=${() => { setError(''); setMode('login'); }}>Ya tengo cuenta · Entrar</button>`}
      ${!info && html`<div class="spinner"></div>`}
    </div>
  <//>`;

  const titles = { setup: 'Crea tu perfil', join: 'Únete con tu código', login: 'Bienvenido de vuelta' };
  const google = info?.googleClientId;
  const gText = mode === 'login' ? 'signin_with' : 'continue_with';
  return html`<${Shell}>
    <button class="back" onClick=${() => { setMode('welcome'); setError(''); setLink(null); }}><${Icon} name="left" size=${20} /> Atrás</button>
    <h1>${titles[mode]}</h1>
    ${mode === 'join' && inviter && html`<div class="invited"><span>💌</span><div><b>${inviter} te invitó a Lindwyrm</b><small>Crea tu perfil para continuar</small></div></div>`}
    ${mode === 'join' && html`<${Field} label="Código de invitación"><input value=${f.code} onInput=${set('code')} maxlength="12" autocapitalize="characters" autocomplete="off" class="code-input" /><//>`}
    ${mode === 'setup' && info?.needsSetupCode && html`<${Field} label="Código de configuración" hint="Es el valor de SETUP_CODE en Netlify."><input value=${f.setupCode} onInput=${set('setupCode')} autocomplete="off" /><//>`}
    ${google && html`<${GoogleButton} clientId=${google} onCredential=${withGoogle} text=${gText} key=${mode} />${html`<div class="or"><span>o con nombre y PIN</span></div>`}`}
    <form class="stack" onSubmit=${submit}>
      <${Field} label="Tu nombre"><input value=${f.name} onInput=${set('name')} maxlength="20" autocomplete="username" autocapitalize="words" required /><//>
      <${Field} label=${mode === 'login' ? 'Tu PIN' : 'Elige un PIN (4 a 8 números)'} hint=${mode !== 'login' ? 'Lo usarás para entrar desde otro teléfono.' : ''}>
        <input type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" value=${f.pin} onInput=${set('pin')} autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} required />
      <//>
      ${error && html`<p class="notice" role="alert">${error}</p>`}
      <button class="btn primary block lg" disabled=${busy}>${busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : mode === 'join' ? 'Continuar' : 'Crear espacio'}</button>
      ${mode === 'login' && html`<button type="button" class="link" onClick=${openRecover}>Olvidé mi nombre o mi PIN</button>`}
    </form>
  <//>`;
}

const Shell = ({ children, hero }) => html`<div class=${cx('auth', hero && 'hero')}>
  <div class="glow g1"></div><div class="glow g2"></div>
  <div class="auth-in">${hero && html`<div class="logo-mark big"><${Icon} name="heart" size=${44} fill /></div>`}${children}</div>
</div>`;
