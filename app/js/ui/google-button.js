import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { renderGoogleButton } from '../google.js';

/** Botón oficial de Google. Si el script no carga (sin internet o bloqueado) lo dice en vez de quedarse vacío. */
export function GoogleButton({ clientId, onCredential, text }) {
  const box = useRef();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    renderGoogleButton(box.current, clientId, onCredential, { text }).catch(() => setFailed(true));
  }, [clientId, text]);
  if (!clientId) return null;
  return html`<div class="google-wrap">
    <div ref=${box} class="google-btn"></div>
    ${failed && html`<p class="notice">No pude cargar Google. Revisa tu conexión o usa tu PIN.</p>`}
  </div>`;
}
