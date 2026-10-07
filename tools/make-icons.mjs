// Genera los iconos de Lindwyrm a partir de tools/logo-source.png (corazón con pesa sobre blanco, 1024×1024).
// 1) Quita el fondo blanco (queda el corazón con pesa transparente).  2) Lo pone sobre un degradado difuminado de colores.
// Usa Chromium (Playwright) solo para dibujar: node tools/make-icons.mjs   (requiere `playwright` instalado)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'app', 'icons');
mkdirSync(out, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const src = `data:image/png;base64,${readFileSync(join(here, 'logo-source.png')).toString('base64')}`;

// zoom = qué parte de la imagen original se muestra (1 = toda). “any” va más cerca; la maskable deja margen de seguridad.
const targets = [
  { file: 'icon-192.png', size: 192, zoom: 0.8, bg: true },
  { file: 'icon-512.png', size: 512, zoom: 0.8, bg: true },
  { file: 'icon-maskable-512.png', size: 512, zoom: 1, bg: true },
  { file: 'apple-touch-icon.png', size: 180, zoom: 0.8, bg: true },
  { file: 'logo-heart.png', size: 256, zoom: 0.8, bg: false }, // transparente: la app le pone el degradado animado
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const results = await page.evaluate(async ({ src, targets }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const W = img.naturalWidth;

  // --- quitar el fondo: se rellena desde los bordes todo lo casi blanco (la pesa blanca queda dentro del corazón y se conserva) ---
  const base = document.createElement('canvas');
  base.width = base.height = W;
  const bg = base.getContext('2d', { willReadFrequently: true });
  bg.drawImage(img, 0, 0);
  const data = bg.getImageData(0, 0, W, W);
  const px = data.data;
  const white = (i) => px[i] > 232 && px[i + 1] > 232 && px[i + 2] > 232;
  const mask = new Uint8Array(W * W); // 1 = fondo
  const stack = [];
  const push = (x, y) => { const k = y * W + x; if (!mask[k] && white(k * 4)) { mask[k] = 1; stack.push(k); } };
  for (let i = 0; i < W; i++) { push(i, 0); push(i, W - 1); push(0, i); push(W - 1, i); }
  while (stack.length) {
    const k = stack.pop(), x = k % W, y = (k / W) | 0;
    if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < W - 1) push(x, y + 1);
  }
  // borde suave: los píxeles junto al fondo se vuelven semitransparentes según qué tan blancos son
  let near = new Uint8Array(W * W);
  for (let r = 0; r < 3; r++) {
    const next = near.slice(); // cada pasada crece un píxel (sin propagarse dentro de la misma pasada)
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (mask[k] || near[k]) continue;
      const m = (j) => mask[j] || near[j];
      if (m(k - 1) || m(k + 1) || m(k - W) || m(k + W)) next[k] = 1;
    }
    near = next;
  }
  for (let k = 0; k < W * W; k++) {
    const i = k * 4;
    if (mask[k]) { px[i + 3] = 0; continue; }
    if (near[k]) {
      const a = Math.min(1, Math.max(0, (255 - px[i + 1]) / 125));
      px[i + 3] = Math.round(a * 255);
      if (a > 0.05) for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, Math.max(0, Math.round((px[i + c] - 255 * (1 - a)) / a)));
    }
  }
  bg.putImageData(data, 0, 0);

  // --- degradado difuminado de colores (mismo estilo que el logo animado de la app) ---
  const gradient = (g, s) => {
    const lin = g.createLinearGradient(0, 0, s, s);
    lin.addColorStop(0, '#ffe1ee'); lin.addColorStop(1, '#e3dcff');
    g.fillStyle = lin; g.fillRect(0, 0, s, s);
    for (const [x, y, r, c] of [[0.15, 0.2, 0.75, '#ffa6c9'], [0.88, 0.12, 0.7, '#bda9ff'], [0.82, 0.9, 0.75, '#9fead2'], [0.1, 0.92, 0.6, '#ffd39a']]) {
      const rg = g.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
      rg.addColorStop(0, c); rg.addColorStop(1, c + '00');
      g.fillStyle = rg; g.fillRect(0, 0, s, s);
    }
  };

  return targets.map(({ size, zoom, bg: withBg }) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (withBg) gradient(g, size);
    g.imageSmoothingQuality = 'high';
    const side = W * zoom, off = (W - side) / 2;
    if (withBg) { g.shadowColor = 'rgba(120, 10, 50, .35)'; g.shadowBlur = size * 0.04; g.shadowOffsetY = size * 0.015; }
    g.drawImage(base, off, off, side, side, 0, 0, size, size);
    return c.toDataURL('image/png').split(',')[1];
  });
}, { src, targets });
results.forEach((b64, i) => writeFileSync(join(out, targets[i].file), Buffer.from(b64, 'base64')));
await browser.close();
console.log('Iconos generados:', targets.map((t) => t.file).join(', '));
