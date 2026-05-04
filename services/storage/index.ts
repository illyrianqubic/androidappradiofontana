// Storage module — only the React Query cache persister uses MMKV now.
// Bookmarks, listening history, and breaking-id tracking were removed when
// the Library tab was deleted.

const keys = {
  queryCache: 'rf.query.cache',
};

type KeyValueStore = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
};

function createMmkv(id: string) {
  const { MMKV } = require('react-native-mmkv') as {
    MMKV: new (config?: { id?: string }) => {
      getString: (key: string) => string | undefined;
      set: (key: string, value: string) => void;
      delete: (key: string) => void;
    };
  };
  return new MMKV({ id });
}

function createQueryCacheStore(): KeyValueStore {
  try {
    const mmkv = createMmkv('rf-query-cache');
    return {
      getString: (key) => mmkv.getString(key),
      set: (key, value) => mmkv.set(key, value),
      delete: (key) => mmkv.delete(key),
    };
  } catch {
    // Allows Expo Go sessions to run even when MMKV native bindings are unavailable.
    const fallbackStore = new Map<string, string>();
    return {
      getString: (key) => fallbackStore.get(key),
      set: (key, value) => { fallbackStore.set(key, value); },
      delete: (key) => { fallbackStore.delete(key); },
    };
  }
}

// B-4: lazy MMKV initialisation — defer the native instantiation until the
// first read/write (which happens AFTER first paint via the persister hydrate).
let _store: KeyValueStore | null = null;
function store(): KeyValueStore {
  if (_store === null) _store = createQueryCacheStore();
  return _store;
}

export const queryStorage = {
  getItem: (key: string) => store().getString(`${keys.queryCache}.${key}`) ?? null,
  setItem: (key: string, value: string) => store().set(`${keys.queryCache}.${key}`, value),
  removeItem: (key: string) => store().delete(`${keys.queryCache}.${key}`),
};
