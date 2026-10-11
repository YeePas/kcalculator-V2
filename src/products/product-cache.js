/* ── Product database cache (IndexedDB) ────────────────────── */
/* products.json is several MB. In localStorage it would eat the ~5 MB that the diary,
   favourites and settings need (and not fit at all in Safari), so it lives in IndexedDB.
   Every call degrades to "no cache" when IndexedDB is unavailable (private mode, tests). */

const DB_NAME = 'kcalculator';
const STORE = 'cache';
const PRODUCTS_KEY = 'products';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB niet beschikbaar'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function readCachedProducts() {
  try {
    return (await run('readonly', store => store.get(PRODUCTS_KEY))) || null;
  } catch {
    return null;
  }
}

export async function writeCachedProducts(data) {
  try {
    await run('readwrite', store => store.put(data, PRODUCTS_KEY));
    return true;
  } catch (error) {
    console.warn('[DB] Kon productdatabase niet cachen:', error);
    return false;
  }
}

export async function clearCachedProducts() {
  try {
    await run('readwrite', store => store.delete(PRODUCTS_KEY));
  } catch {}
}
