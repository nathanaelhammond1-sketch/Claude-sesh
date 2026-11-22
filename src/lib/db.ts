/**
 * Minimal promise wrapper around IndexedDB. No dependency, transaction-safe:
 * every multi-record change (e.g. rollover) runs inside ONE readwrite
 * transaction so it is atomic — it either fully applies or not at all.
 */

export const DB_NAME = 'daymark';
export const DB_VERSION = 1;

export const STORES = ['tasks', 'entries', 'subtasks', 'reviews', 'events', 'journal', 'days', 'meta'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function upgrade(db: IDBDatabase) {
  if (!db.objectStoreNames.contains('tasks')) {
    const s = db.createObjectStore('tasks', { keyPath: 'id' });
    s.createIndex('scheduledDate', 'scheduledDate');
  }
  if (!db.objectStoreNames.contains('entries')) {
    const s = db.createObjectStore('entries', { keyPath: 'id' });
    s.createIndex('date', 'date');
    s.createIndex('taskId', 'taskId');
  }
  if (!db.objectStoreNames.contains('subtasks')) {
    const s = db.createObjectStore('subtasks', { keyPath: 'id' });
    s.createIndex('taskId', 'taskId');
  }
  if (!db.objectStoreNames.contains('reviews')) {
    const s = db.createObjectStore('reviews', { keyPath: 'id' });
    s.createIndex('date', 'date');
    s.createIndex('taskId', 'taskId');
  }
  if (!db.objectStoreNames.contains('events')) {
    const s = db.createObjectStore('events', { keyPath: 'id' });
    s.createIndex('taskId', 'taskId');
  }
  if (!db.objectStoreNames.contains('journal')) db.createObjectStore('journal', { keyPath: 'id' });
  if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'id' });
  if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
}

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser. DAYMARK needs it to store your data.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => {
      const db = req.result;
      // If another tab upgrades the schema, close so it can proceed.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Could not open the DAYMARK database.'));
    };
    req.onblocked = () => {
      // Another tab holds an old version open; it will close via onversionchange.
    };
  });
  return dbPromise;
}

/** Close and forget the connection (used by tests and full reset). */
export async function closeDB() {
  if (!dbPromise) return;
  try {
    (await dbPromise).close();
  } catch {
    /* ignore */
  }
  dbPromise = null;
}

export function reqP<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface Tx {
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  getAllByIndex<T>(store: StoreName, index: string, value: IDBValidKey): Promise<T[]>;
  put<T>(store: StoreName, value: T): Promise<void>;
  /** Insert only if no record with this key exists. Returns true if inserted. */
  putIfAbsent<T extends { id: string }>(store: StoreName, value: T): Promise<boolean>;
  delete(store: StoreName, key: IDBValidKey): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

export async function withTx<R>(stores: StoreName[] | StoreName, mode: IDBTransactionMode, fn: (t: Tx) => Promise<R>): Promise<R> {
  const db = await openDB();
  const names = Array.isArray(stores) ? stores : [stores];
  const tx = db.transaction(names, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Database transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Database transaction failed'));
  });
  const t: Tx = {
    get: (s, k) => reqP(tx.objectStore(s).get(k)),
    getAll: (s) => reqP(tx.objectStore(s).getAll()),
    getAllByIndex: (s, i, v) => reqP(tx.objectStore(s).index(i).getAll(v)),
    put: async (s, v) => {
      await reqP(tx.objectStore(s).put(v));
    },
    putIfAbsent: async (s, v) => {
      const existing = await reqP(tx.objectStore(s).get(v.id));
      if (existing !== undefined) return false;
      await reqP(tx.objectStore(s).add(v));
      return true;
    },
    delete: async (s, k) => {
      await reqP(tx.objectStore(s).delete(k));
    },
    clear: async (s) => {
      await reqP(tx.objectStore(s).clear());
    },
  };
  let result: R;
  try {
    result = await fn(t);
  } catch (err) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await done.catch(() => undefined);
    throw err;
  }
  await done;
  return result;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
