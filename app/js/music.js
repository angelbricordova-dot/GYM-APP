// Vincular Spotify: el servidor guarda el verificador (PKCE) y devuelve la dirección de Spotify. Al volver, `?code=…&state=…` se manda al servidor.
import * as S from './store.js';

export async function startSpotifyLink() {
  const r = await S.request('POST', '/spotify/start', { redirectUri: `${location.origin}/` });
  if (!r.ok) return { ok: false, error: r.data.error || 'No se pudo iniciar.' };
  location.href = r.data.url;
  return { ok: true };
}

/** Si la página se abrió de regreso desde Spotify, termina la vinculación (funciona aunque abra en otro navegador). */
export async function finishSpotifyLink() {
  const q = new URL(location.href).searchParams;
  const state = q.get('state');
  if (!state || (!q.get('code') && !q.get('error'))) return null;
  history.replaceState(null, '', '/');
  if (q.get('error')) return { ok: false, error: 'No se vinculó Spotify.' };
  const r = await S.request('POST', '/spotify/callback', { code: q.get('code'), state });
  return r.ok ? { ok: true, name: r.data.name } : { ok: false, error: r.data.error };
}
