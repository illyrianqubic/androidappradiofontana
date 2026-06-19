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
  getAllKeys: () => string[];
};

function createMmkv(id: string) {
  const { MMKV } = require('react-native-mmkv') as {
    MMKV: new (config?: { id?: string }) => {
      getString: (key: string) => string | undefined;
      set: (key: string, value: string) => void;
      delete: (key: string) => void;
      getAllKeys: () => string[];
    };
  };
  return new MMKV({ id });
}

function createQueryCacheStore(): KeyValueStore {
  const fallbackStore = new Map<string, string>();
  try {
    const mmkv = createMmkv('rf-query-cache');
    return {
      getString: (key) => mmkv.getString(key),
      set: (key, value) => {
        try {
          mmkv.set(key, value);
        } catch {
          fallbackStore.set(key, value);
        }
      },
      delete: (key) => mmkv.delete(key),
      getAllKeys: () => mmkv.getAllKeys(),
    };
  } catch {
    // Allows Expo Go sessions to run even when MMKV native bindings are unavailable.
    return {
      getString: (key) => fallbackStore.get(key),
      set: (key, value) => { fallbackStore.set(key, value); },
      delete: (key) => { fallbackStore.delete(key); },
      getAllKeys: () => Array.from(fallbackStore.keys()),
    };
  }
}

function createAppSettingsStore(): KeyValueStore {
  const fallbackStore = new Map<string, string>();
  try {
    const mmkv = createMmkv('rf-app-settings');
    return {
      getString: (key) => mmkv.getString(key),
      set: (key, value) => {
        try {
          // H-B10: cap reaction keys at 200. When writing a new reaction,
          // delete the oldest 50 (by alphabetical slug order) to stay under
          // the limit and prevent unbounded MMKV growth.
          if (key.startsWith('reaction_')) {
            const reactionKeys = mmkv.getAllKeys().filter((k) => k.startsWith('reaction_'));
            if (reactionKeys.length >= 200) {
              const toDelete = reactionKeys.sort().slice(0, 50);
              for (const k of toDelete) {
                try { mmkv.delete(k); } catch { /* best effort */ }
              }
            }
          }
          mmkv.set(key, value);
        } catch {
          fallbackStore.set(key, value);
        }
      },
      delete: (key) => mmkv.delete(key),
      getAllKeys: () => mmkv.getAllKeys(),
    };
  } catch {
    // Expo Go fallback — settings persist only for the session.
    return {
      getString: (key) => fallbackStore.get(key),
      set: (key, value) => {
        // H-B10: same cap for the in-memory fallback.
        if (key.startsWith('reaction_')) {
          const reactionKeys = Array.from(fallbackStore.keys()).filter((k) => k.startsWith('reaction_'));
          if (reactionKeys.length >= 200) {
            const toDelete = reactionKeys.sort().slice(0, 50);
            for (const k of toDelete) { fallbackStore.delete(k); }
          }
        }
        fallbackStore.set(key, value);
      },
      delete: (key) => { fallbackStore.delete(key); },
      getAllKeys: () => Array.from(fallbackStore.keys()),
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

let _appSettingsStore: KeyValueStore | null = null;
function appSettingsStore(): KeyValueStore {
  if (_appSettingsStore === null) _appSettingsStore = createAppSettingsStore();
  return _appSettingsStore;
}

export const queryStorage = {
  getItem: (key: string) => store().getString(`${keys.queryCache}.${key}`) ?? null,
  setItem: (key: string, value: string) => store().set(`${keys.queryCache}.${key}`, value),
  removeItem: (key: string) => store().delete(`${keys.queryCache}.${key}`),
};

export const appSettings = {
  getItem: (key: string) => appSettingsStore().getString(key) ?? null,
  setItem: (key: string, value: string) => appSettingsStore().set(key, value),
  removeItem: (key: string) => appSettingsStore().delete(key),
};
