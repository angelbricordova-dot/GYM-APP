import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, PALETTE, onColor } from '../app/js/logic.js';

// Lee los tokens de color de styles.css y comprueba contraste WCAG: texto normal 4.5:1.
const css = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
const tokens = (selector) => {
  const block = css.slice(css.indexOf(selector)).split('}')[0];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
};
const themes = { noche: tokens(':root, :root[data-theme=dark]'), día: tokens(':root[data-theme=light]') };

for (const [name, t] of Object.entries(themes)) {
  test(`contraste en modo ${name}: el texto se lee sobre sus fondos (≥ 4.5:1)`, () => {
    const pairs = [['text', 'bg'], ['text', 's1'], ['text', 's2'], ['text2', 'bg'], ['text2', 's1'], ['text2', 's2'], ['love', 's1'], ['good', 's1'], ['bad', 's1'], ['warn', 's1'], ['ember', 's1'], ['on-good', 'good'], ['on-bad', 'bad']];
    for (const [fg, bg] of pairs) assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${name}: ${fg} ${t[fg]} sobre ${bg} ${t[bg]} = ${contrast(t[fg], t[bg]).toFixed(2)}`);
  });
}

test('los 24 colores de acento: el texto de los botones llega a 3:1 (negrita grande) y nunca queda ilegible', () => {
  for (const c of PALETTE) assert.ok(contrast(c, onColor(c)) >= 3, `${c} + ${onColor(c)} = ${contrast(c, onColor(c)).toFixed(2)}`);
});

test('el acento como texto se puede aclarar/oscurecer hasta 4.5:1 en ambos modos (para cualquier color)', async () => {
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {} }); // theme.js lee el modo del sistema
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const { readableAccent } = await import('../app/js/theme.js');
  for (const c of [...PALETTE, '#FFFFFF', '#000000', '#FFEE00']) {
    assert.ok(contrast(readableAccent(c, 'light'), '#ffffff') >= 4.5, `día ${c}`);
    assert.ok(contrast(readableAccent(c, 'dark'), '#14141b') >= 4.5, `noche ${c}`);
  }
});

test('la hoja de estilos define todos los tokens en ambos temas', () => {
  for (const t of Object.values(themes)) for (const k of ['bg', 's1', 's2', 's3', 'text', 'text2', 'love', 'good', 'on-good', 'bad', 'on-bad', 'warn', 'ember']) assert.ok(t[k], `falta --${k}`);
});
