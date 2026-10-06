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
