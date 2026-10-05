import { useState, useEffect } from '../../vendor/preact-htm.js';
import * as S from '../store.js';

// Navegación mínima: una pestaña activa + una pila de pantallas completas (entreno, perfil, check-in).
export const nav = { tab: 'today', stack: [] };
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export const goTab = (tab) => { nav.tab = tab; nav.stack = []; scrollTo(0, 0); emit(); };
export const openScreen = (id, props = {}) => { nav.stack = [...nav.stack, { id, props }]; emit(); };
export const closeScreen = () => { nav.stack = nav.stack.slice(0, -1); emit(); };
export const replaceScreen = (id, props = {}) => { nav.stack = [...nav.stack.slice(0, -1), { id, props }]; emit(); };

/** Re-renderiza el componente cuando cambian el estado de la app o la navegación. */
export function useApp() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((v) => v + 1);
    subs.add(f);
    const off = S.subscribe(f);
    return () => { subs.delete(f); off(); };
  }, []);
  return S.state;
}
