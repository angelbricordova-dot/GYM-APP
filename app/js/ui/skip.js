import { html, useState } from '../../vendor/preact-htm.js';
import * as S from '../store.js';
import * as L from '../logic.js';
import { Icon, Sheet, Field, toast, cx } from './kit.js';

const REASONS = ['Me dio flojera', 'Estoy cansado/a', 'Trabajo o estudio', 'Me siento mal', 'Imprevisto'];

/** “Hoy no voy”: la razón le llega a tu pareja y resta puntos de amor (si al final sí entrenas, se devuelven). */
export function SkipSheet({ onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const partner = S.state.partner?.name;
  const send = async () => {
    setBusy(true);
    const r = await S.skipToday(reason);
    setBusy(false);
    if (!r.ok) return toast(r.data.error, { icon: '⚠️' });
    toast(r.sent ? `Se lo avisé a ${partner || 'tu pareja'}` : 'Guardado; se enviará al reconectar', { icon: '💬' });
    onClose();
  };
  return html`<${Sheet} title="Hoy no voy" onClose=${onClose}>
    <p class="muted">Cuéntale la razón${partner ? ` a ${partner}` : ''}. Va en una nota y no se oculta.</p>
    <div class="chips">${REASONS.map((r) => html`<button class=${cx('chip pick', reason === r && 'on')} onClick=${() => setReason(r)}>${r}</button>`)}</div>
    <${Field} label="La razón"><input value=${reason} onInput=${(e) => setReason(e.target.value)} maxlength="140" placeholder="No fui porque…" /><//>
    <div class="notice skip-cost">Resta <b>${L.EARN.skip} puntos de amor</b>. Si al final entrenas hoy, te los devuelvo.</div>
    <button class="btn primary block lg" disabled=${!reason.trim() || busy} onClick=${send}><${Icon} name="send" size=${18} /> ${busy ? 'Enviando…' : 'Avisar y confirmar'}</button>
  <//>`;
}
