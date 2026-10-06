// Enlace de invitación: abre la pantalla “Únete” con el código ya escrito.
import { toast } from './ui/kit.js';

export const inviteLink = (code) => `${location.origin}/?join=${code}`;

export async function copyInvite(code) {
  try { await navigator.clipboard.writeText(inviteLink(code)); toast('Enlace copiado', { icon: '🔗' }); }
  catch { toast('No pude copiarlo. Mantén presionado el código y cópialo a mano.', { icon: '⚠️' }); }
}

/** Abre el menú de compartir del teléfono (WhatsApp, Mensajes…); si no existe, copia el enlace. */
export async function shareInvite(code, name) {
  const text = `${name ? `${name} te invita` : 'Te invito'} a Lindwyrm 💗 Entra con este enlace y acepta unirte:`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Lindwyrm', text, url: inviteLink(code) }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  await copyInvite(code);
}
