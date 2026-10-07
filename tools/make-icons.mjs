// Genera los iconos de Lindwyrm a partir de tools/logo-source.png (corazón con pesa, 1024×1024).
// Usa Chromium (Playwright) solo para reescalar: node tools/make-icons.mjs   (requiere `playwright` instalado)
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
  { file: 'icon-192.png', size: 192, zoom: 0.78 },
  { file: 'icon-512.png', size: 512, zoom: 0.78 },
  { file: 'icon-maskable-512.png', size: 512, zoom: 1 },
  { file: 'apple-touch-icon.png', size: 180, zoom: 0.78 },
  { file: 'logo.png', size: 256, zoom: 0.78 }, // dentro de la app
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const results = await page.evaluate(async ({ src, targets }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return targets.map(({ size, zoom }) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    g.imageSmoothingQuality = 'high';
    const side = img.naturalWidth * zoom, off = (img.naturalWidth - side) / 2;
    g.drawImage(img, off, off, side, side, 0, 0, size, size);
    return c.toDataURL('image/png').split(',')[1];
  });
}, { src, targets });
results.forEach((b64, i) => writeFileSync(join(out, targets[i].file), Buffer.from(b64, 'base64')));
await browser.close();
console.log('Iconos generados:', targets.map((t) => t.file).join(', '));
