// Genera los iconos PNG de la app (sin dependencias): node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4);
  head[8] = 8; head[9] = 6; // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Mancuerna en coordenadas 0..1: [x0, y0, x1, y1, radio]
const SHAPES = [
  [0.22, 0.475, 0.78, 0.525, 0.025], // barra
  [0.30, 0.30, 0.38, 0.70, 0.03], // disco interior izq.
  [0.62, 0.30, 0.70, 0.70, 0.03], // disco interior der.
  [0.20, 0.38, 0.28, 0.62, 0.03], // disco exterior izq.
  [0.72, 0.38, 0.80, 0.62, 0.03], // disco exterior der.
];
const inRound = (x, y, [x0, y0, x1, y1, r]) => {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const A = [124, 92, 255], B = [255, 92, 138];

function icon(size) {
  const SS = 3; // supersampling para bordes suaves
  return png(size, (u, v) => {
    const bg = mix(A, B, (u + v) / 2);
    let hits = 0;
    for (let i = 0; i < SS; i++) for (let j = 0; j < SS; j++) {
      const x = u + (i + 0.5) / SS / size, y = v + (j + 0.5) / SS / size;
      if (SHAPES.some((s) => inRound(x, y, s))) hits++;
    }
    return mix(bg, [255, 255, 255], hits / (SS * SS));
  });
}

const dir = new URL('../app/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, dir), icon(size));
  console.log('ok', name);
}
