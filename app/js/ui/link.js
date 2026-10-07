import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import { pactOk, PACT_PHRASE } from '../logic.js';
import { Icon, Heart, Sheet, Field, toast, cx } from './kit.js';

/** Ya con cuenta y sin pareja: unirme al espacio de otra persona con su código (y la frase de aceptación). */
export function JoinOtherSheet({ onClose }) {
  const [code, setCode] = useState(S.state.pendingInvite || '');
  const [inviter, setInviter] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const check = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await S.checkInvite(code);
    setBusy(false);
    if (!r.ok) return setError(r.data.error);
    setInviter(r.data.inviter);
  };
  const accept = async () => {
    setBusy(true); setError('');
    const r = await S.joinOther({ inviteCode: code, pact: phrase });
    setBusy(false);
    if (!r.ok) return setError(r.data.error || 'Algo salió mal.');
    toast(`Ya estás vinculado con ${inviter}`, { icon: '💗' });
    onClose();
  };

  return html`<${Sheet} title=${inviter ? `${inviter} quiere preguntarte algo` : 'Unirme con otro código'} onClose=${onClose}>
    ${!inviter
      ? html`<form class="stack" onSubmit=${check}>
          <p class="muted">Escribe el código que te mandó la otra persona (o abre su enlace).</p>
          <${Field} label="Código de invitación"><input value=${code} onInput=${(e) => setCode(e.target.value)} maxlength="12" autocapitalize="characters" autocomplete="off" class="code-input" /><//>
          ${error && html`<p class="notice" role="alert">${error}</p>`}
          <button class="btn primary block lg" disabled=${!code.trim() || busy}>${busy ? 'Un momento…' : 'Continuar'}</button>
        </form>`
      : html`<div class="pact">
          <div class="pact-heart"><${Heart} size=${44} /></div>
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
        </div>`}
  <//>`;
}
