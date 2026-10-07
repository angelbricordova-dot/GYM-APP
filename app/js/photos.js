// Fotos: se guardan primero en el teléfono (IndexedDB) y se suben cuando hay señal.
// En el gimnasio casi nunca hay buena cobertura, así que el check-in nunca depende de la red.

const urls = new Map();
const DB = 'gymduo-photos';
const STORE = 'photos';

const open = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

async function run(mode, fn) {
  try {
    const db = await open();
    return await new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
    });
  } catch {
    return undefined; // IndexedDB bloqueado (modo privado): la app sigue funcionando sin caché de fotos
  }
}

export const putPhoto = (id, blob) => run('readwrite', (s) => s.put(blob, id));
export const clearAllPhotos = () => { urls.clear(); return run('readwrite', (s) => s.clear()); };
export const getPhoto = (id) => run('readonly', (s) => s.get(id));

/** Reduce una imagen a JPEG (lado mayor `max`) respetando la orientación del teléfono. */
export async function processImage(file, { max = 1080, quality = 0.8, square = 0 } = {}) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  const img = bmp || (await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(file);
  }));
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (square) {
    const side = Math.min(w, h);
    c.width = c.height = square;
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, square, square);
  } else {
    const k = Math.min(1, max / Math.max(w, h));
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    ctx.drawImage(img, 0, 0, c.width, c.height);
  }
  bmp?.close?.();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la foto'))), 'image/jpeg', quality));
}

/**
 * Guardar un archivo en el dispositivo. En el teléfono abre la hoja de compartir (“Guardar imagen / video”); si no existe, descarga.
 * Devuelve 'shared' | 'download' | 'cancel'.
 */
export async function saveToDevice(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Lindwyrm' }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancel'; /* si falla, se descarga */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'download';
}
export const extOf = (type = '') => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[type.split(';')[0]] || 'bin');

export const toDataURL = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

/** URL local (blob:) de una foto: primero el caché del teléfono, si no se descarga de la nube. */
export function photoUrl(uid, pid, download) {
  const k = `${uid}/${pid}`;
  if (!urls.has(k)) {
    urls.set(k, (async () => {
      let blob = await getPhoto(k);
      if (!blob) {
        blob = await download(`/photo/${uid}/${pid}`);
        if (blob) putPhoto(k, blob);
      }
      return blob ? URL.createObjectURL(blob) : null;
    })().then((u) => { if (!u) urls.delete(k); return u; }, (e) => { urls.delete(k); throw e; }));
  }
  return urls.get(k);
}

/** Registra una foto recién tomada bajo su clave definitiva para verla al instante. */
export const cachePhoto = (uid, pid, blob) => { urls.delete(`${uid}/${pid}`); return putPhoto(`${uid}/${pid}`, blob); };

/**
 * Los WebM que graba el navegador (MediaRecorder) no traen la duración, así que el reproductor no muestra la línea de tiempo ni deja adelantar.
 * Se le escribe la duración en la cabecera (elemento Duration dentro de Info). Si algo no cuadra, devuelve el archivo tal cual.
 */
export async function fixWebmDuration(blob, ms) {
  try {
    if (!blob.type.includes('webm') || !(ms > 0)) return blob;
    const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
    let i = -1;
    for (let k = 0; k < head.length - 8; k++) if (head[k] === 0x15 && head[k + 1] === 0x49 && head[k + 2] === 0xa9 && head[k + 3] === 0x66) { i = k; break; }
    if (i < 0) return blob;
    const first = head[i + 4];
    let len = 1;
    while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
    if (len > 8) return blob;
    let size = first & (0xff >> len);
    for (let k = 1; k < len; k++) size = size * 256 + head[i + 4 + k];
    const start = i + 4 + len;
    if (!(size > 0) || start + size > head.length) return blob;
    const info = head.subarray(start, start + size);
    for (let k = 0; k < info.length - 2; k++) if (info[k] === 0x44 && info[k + 1] === 0x89 && info[k + 2] === 0x88) return blob; // ya trae duración
    const dur = new Uint8Array(11);
    dur.set([0x44, 0x89, 0x88]);
    new DataView(dur.buffer).setFloat64(3, ms);
    const newSize = size + dur.length, sz = new Uint8Array(8);
    sz[0] = 0x01;
    for (let k = 7; k >= 1; k--) sz[k] = Math.floor(newSize / 256 ** (7 - k)) & 0xff;
    return new Blob([head.subarray(0, i + 4), sz, info, dur, blob.slice(start + size)], { type: blob.type });
  } catch { return blob; }
}
