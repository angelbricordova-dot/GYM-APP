// Genera los iconos PNG de Lindwyrm (corazón blanco sobre degradado rosa→violeta) (sin dependencias): node tools/make-icons.mjs
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

// Corazón (curva implícita clásica) centrado en el icono. Devuelve true si el punto (u, v) en 0..1 queda dentro.
const inHeart = (u, v) => {
  const x = (u - 0.5) / 0.27, y = -(v - 0.54) / 0.27;
  return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0;
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const A = [255, 92, 147], B = [139, 124, 255];

function icon(size) {
  const SS = 3; // supersampling para bordes suaves
  return png(size, (u, v) => {
    const bg = mix(A, B, (u + v) / 2);
    let hits = 0;
    for (let i = 0; i < SS; i++) for (let j = 0; j < SS; j++) {
      const x = u + (i + 0.5) / SS / size, y = v + (j + 0.5) / SS / size;
      if (inHeart(x, y)) hits++;
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
