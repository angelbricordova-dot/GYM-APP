// “Iniciar sesión con Google” (Google Identity Services). El botón lo dibuja Google; nosotros solo
// recibimos un ID token que el servidor verifica. Requiere GOOGLE_CLIENT_ID en Netlify.
let loading;

export const loadGoogle = () =>
  (loading ||= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { loading = null; reject(new Error('No se pudo cargar Google')); };
    document.head.appendChild(s);
  }));

export async function renderGoogleButton(el, clientId, onCredential, { text = 'continue_with' } = {}) {
  const g = await loadGoogle();
  g.accounts.id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential), ux_mode: 'popup', auto_select: false, use_fedcm_for_prompt: true });
  el.innerHTML = '';
  g.accounts.id.renderButton(el, {
    type: 'standard', shape: 'pill', size: 'large', text, locale: 'es', width: Math.min(400, el.clientWidth || 320),
    theme: document.documentElement.dataset.theme === 'light' ? 'outline' : 'filled_black',
  });
}
