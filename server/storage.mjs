// Almacenamiento clave→valor. En Netlify usa Netlify Blobs; en local (LOCAL_DB_DIR) usa archivos.
// Así el mismo handler corre en producción y en pruebas sin servicios externos.
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const enc = encodeURIComponent;
const dec = decodeURIComponent;

function localStore(dir) {
  const file = (k) => join(dir, enc(k));
  const ready = mkdir(dir, { recursive: true });
  return {
    async get(key) {
      await ready;
      try { return JSON.parse(await readFile(file(key), 'utf8')); } catch { return null; }
    },
    async set(key, value) {
      await ready;
      await writeFile(file(key), JSON.stringify(value));
    },
    async del(key) {
      await ready;
      await rm(file(key), { force: true });
      await rm(file(key + '.meta'), { force: true });
    },
    async list(prefix) {
      await ready;
      return (await readdir(dir)).map(dec).filter((k) => k.startsWith(prefix) && !k.endsWith('.meta')).sort();
    },
    async getBin(key) {
      await ready;
      try {
        const meta = JSON.parse(await readFile(file(key + '.meta'), 'utf8'));
        return { data: await readFile(file(key)), type: meta.type };
      } catch { return null; }
    },
    async setBin(key, data, type) {
      await ready;
      await writeFile(file(key), data);
      await writeFile(file(key + '.meta'), JSON.stringify({ type }));
    },
  };
}

function blobStore() {
  let storePromise;
  const store = () =>
    (storePromise ||= import('@netlify/blobs').then(({ getStore }) => getStore({ name: 'gymduo', consistency: 'strong' })));
  return {
    async get(key) { return (await store()).get(key, { type: 'json' }); },
    async set(key, value) { await (await store()).setJSON(key, value); },
    async del(key) { await (await store()).delete(key); },
    async list(prefix) {
      const { blobs } = await (await store()).list({ prefix });
      return blobs.map((b) => b.key).sort();
    },
    async getBin(key) {
      const r = await (await store()).getWithMetadata(key, { type: 'arrayBuffer' });
      return r ? { data: Buffer.from(r.data), type: r.metadata?.type || 'image/jpeg' } : null;
    },
    async setBin(key, data, type) { await (await store()).set(key, data, { metadata: { type } }); },
  };
}

export const createStorage = () => (process.env.LOCAL_DB_DIR ? localStore(process.env.LOCAL_DB_DIR) : blobStore());
