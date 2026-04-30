export type SavedArticle = {
  id: string;
  slug: string;
  title: string;
  imageUrl?: string | null;
  author?: string | null;
  publishedAt: string;
  category?: string | null;
};

export type ListeningHistoryItem = {
  id: string;
  title: string;
  artist?: string;
  listenedAt: string;
};

const keys = {
  bookmarks: 'rf.bookmarks',
  listeningHistory: 'rf.history',
  lastBreakingId: 'rf.breaking.last',
  queryCache: 'rf.query.cache',
};

type KeyValueStore = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
  // C-A4: optional native subscription scoped to a single key. When the
  // backend supports it (MMKV native), the listener is registered with the
  // exact key it cares about and never fires for unrelated writes — so the
  // hot persister-write loop (every 10s) does not wake every consumer.
  subscribeKey?: (key: string, listener: () => void) => { remove: () => void };
};

function createMmkv(id: string) {
  const { MMKV } = require('react-native-mmkv') as {
    MMKV: new (config?: { id?: string }) => {
      getString: (key: string) => string | undefined;
      set: (key: string, value: string) => void;
      delete: (key: string) => void;
      addOnValueChangedListener: (
        listener: (changedKey: string) => void,
      ) => { remove: () => void };
    };
  };
  return new MMKV({ id });
}

// C-A3: split MMKV into two physical files.
//   • userDataStore  – cold writes (bookmarks, listening history, breaking-id).
//     Mostly read-mostly; writes only on user action. Compaction never blocks
//     the hot path.
//   • queryCacheStore – hot writes from the React Query persister (every 10s
//     during any active session). Lives in its own file so its append-only
//     compaction (50–250 ms blocking on Cortex-A53) cannot stall reads of
//     bookmarks/history, and listener fan-out from persister writes never
//     reaches user-data subscribers.
function createSplitStores(): { userDataStore: KeyValueStore; queryCacheStore: KeyValueStore } {
  try {
    const userMmkv = createMmkv('rf-user-data');
    const cacheMmkv = createMmkv('rf-query-cache');

    const wrap = (mmkv: ReturnType<typeof createMmkv>): KeyValueStore => ({
      getString: (key: string) => mmkv.getString(key),
      set: (key: string, value: string) => {
        // R-1/X-2: mark the in-flight key so the synchronous listener
        // fan-out that follows can skip self-fires. MMKV's native callback
        // invokes JS synchronously on the same JSI hop — by the time
        // .set() returns, every listener for this key has run, so resetting
        // _isWriting after the call is race-free within this single thread.
        _isWriting = key;
        try {
          mmkv.set(key, value);
        } finally {
          _isWriting = null;
        }
      },
      delete: (key: string) => {
        _isWriting = key;
        try {
          mmkv.delete(key);
        } finally {
          _isWriting = null;
        }
      },
      subscribeKey: (key: string, listener: () => void) => {
        // Native MMKV does not support per-key subscription; we filter on the
        // C++→JS hop. Each instance only sees writes for ITS keys, so the
        // user-data listener never wakes on persister cache writes (C-A4).
        // R-1/X-2: also drop the callback when the change came from THIS
        // process's own write — prevents cache self-invalidation and the
        // self-induced setState->re-parse loop in Library on every save.
        const sub = mmkv.addOnValueChangedListener((changedKey) => {
          if (changedKey !== key) return;
          if (_isWriting === changedKey) return;
          listener();
        });
        return { remove: () => sub.remove() };
      },
    });

    return {
      userDataStore: wrap(userMmkv),
      queryCacheStore: wrap(cacheMmkv),
    };
  } catch {
    // Allows Expo Go sessions to run even when MMKV native bindings are unavailable.
    const make = (): KeyValueStore => {
      const fallbackStore = new Map<string, string>();
      return {
        getString: (key: string) => fallbackStore.get(key),
        set: (key: string, value: string) => {
          fallbackStore.set(key, value);
        },
        delete: (key: string) => {
          fallbackStore.delete(key);
        },
      };
    };
    return { userDataStore: make(), queryCacheStore: make() };
  }
}

// B-4: lazy MMKV initialisation. createSplitStores() instantiates two native
// MMKV files, each ~15–30 ms blocking on Cortex-A53. Doing it at module load
// added ~30–60 ms to the cold-start critical path before first paint. We
// defer until the first read/write, which always happens AFTER first paint
// (library tab, audio history write, persister hydrate — all post-mount).
let _splitStores: { userDataStore: KeyValueStore; queryCacheStore: KeyValueStore } | null = null;
function stores() {
  if (_splitStores === null) {
    _splitStores = createSplitStores();
  }
  return _splitStores;
}
// Lazy proxies preserve the simple `store.getString(...)` call sites without
// pre-warming MMKV at module load. Each proxy method dereferences `stores()`
// on call — the first call pays the init cost, all subsequent calls are
// direct property accesses on the cached instance.
const userDataStore: KeyValueStore = {
  getString: (key) => stores().userDataStore.getString(key),
  set: (key, value) => stores().userDataStore.set(key, value),
  delete: (key) => stores().userDataStore.delete(key),
  subscribeKey: (key, listener) =>
    stores().userDataStore.subscribeKey!(key, listener),
};
const queryCacheStore: KeyValueStore = {
  getString: (key) => stores().queryCacheStore.getString(key),
  set: (key, value) => stores().queryCacheStore.set(key, value),
  delete: (key) => stores().queryCacheStore.delete(key),
};
// Backwards-compat alias used only inside this module for user-data calls.
const store = userDataStore;

// X-2 + R-1: writer-aware listener filter. The C++→JS value-changed callback
// fires for EVERY write to the userData MMKV file (the listener is global per
// instance — there is no native per-key subscription). Without filtering, a
// write to `rf.history` would also wake `rf.bookmarks` subscribers, and even
// a write would re-fire its OWN subscription (R-1 cache wipe). We track the
// key currently being written by THIS process and skip listener fan-out for
// it; cross-process writes (none in this app) would still wake correctly.
let _isWriting: string | null = null;

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  store.set(key, JSON.stringify(value));
}

let _bookmarksCache: SavedArticle[] | null = null;

function readSavedArticles(): SavedArticle[] {
  if (_bookmarksCache !== null) return _bookmarksCache;
  const parsed = parseJson<SavedArticle[]>(store.getString(keys.bookmarks), []);
  _bookmarksCache = parsed;
  return parsed;
}

function saveSavedArticles(next: SavedArticle[]) {
  _bookmarksCache = next;
  saveJson(keys.bookmarks, next);
}

export function getSavedArticles(): SavedArticle[] {
  return readSavedArticles().slice();
}

export function isArticleSaved(slug: string): boolean {
  return readSavedArticles().some((item) => item.slug === slug);
}

function upsertSavedArticle(article: SavedArticle): SavedArticle[] {
  const next = readSavedArticles().slice();
  const idx = next.findIndex((item) => item.slug === article.slug);

  if (idx >= 0) {
    next[idx] = article;
  } else {
    next.unshift(article);
  }

  saveSavedArticles(next);
  return next;
}

function removeSavedArticle(slug: string): SavedArticle[] {
  const next = readSavedArticles().filter((item) => item.slug !== slug);
  saveSavedArticles(next);
  return next;
}

export function toggleSavedArticle(article: SavedArticle): {
  saved: boolean;
  items: SavedArticle[];
} {
  if (isArticleSaved(article.slug)) {
    return {
      saved: false,
      items: removeSavedArticle(article.slug),
    };
  }

  return {
    saved: true,
    items: upsertSavedArticle(article),
  };
}

// M-C1: in-memory cache of the parsed listening history. Avoids JSON.parse on
// the ~3KB blob every status tick (was ~0.4 ms each, called per song change).
// External writers (clear, append, or another process) invalidate via the
// MMKV listener registered below so the cache never goes stale.
let _historyCache: ListeningHistoryItem[] | null = null;

export function getListeningHistory(): ListeningHistoryItem[] {
  if (_historyCache !== null) return _historyCache;
  const parsed = parseJson<ListeningHistoryItem[]>(
    store.getString(keys.listeningHistory),
    [],
  );
  _historyCache = parsed;
  return parsed;
}

export function addListeningHistory(item: ListeningHistoryItem) {
  const current = getListeningHistory().filter((entry) => entry.id !== item.id);
  current.unshift(item);
  const next = current.slice(0, 30);
  _historyCache = next;
  saveJson(keys.listeningHistory, next);
}

export function clearListeningHistory() {
  _historyCache = [];
  store.delete(keys.listeningHistory);
}

// R-1: cache invalidation is no longer needed at the listener level \u2014 the
// writer-aware filter in `wrap()` drops self-fires entirely. addListening-
// History updates _historyCache inline, so the in-memory copy is always
// authoritative for THIS process. (Cross-process writes do not exist in
// this app.) Removing the listener also removes the only path that nulled
// the cache mid-tick, fixing the M-C1 regression where the cache was wiped
// microseconds after being filled.

export function setLastBreakingId(id: string) {
  store.set(keys.lastBreakingId, id);
}

export function getLastBreakingId(): string | undefined {
  return store.getString(keys.lastBreakingId);
}

export const queryStorage = {
  getItem: (key: string) =>
    queryCacheStore.getString(`${keys.queryCache}.${key}`) ?? null,
  setItem: (key: string, value: string) => {
    queryCacheStore.set(`${keys.queryCache}.${key}`, value);
  },
  removeItem: (key: string) => {
    queryCacheStore.delete(`${keys.queryCache}.${key}`);
  },
};

// C-A4: subscribe to a single user-data key. Uses the per-key MMKV adapter so
// the underlying listener only fires when that exact key changes — persister
// writes (in the separate queryCacheStore instance) cannot wake this path at
// all. On the fallback Map store the listener is a no-op.
export function subscribeToStorageKey(
  watchedKey: string,
  listener: () => void,
): () => void {
  if (!userDataStore.subscribeKey) {
    return () => undefined;
  }
  const sub = userDataStore.subscribeKey(watchedKey, () => {
    if (watchedKey === keys.bookmarks) {
      _bookmarksCache = null;
    } else if (watchedKey === keys.listeningHistory) {
      _historyCache = null;
    }
    listener();
  });
  return () => sub.remove();
}

export const storageKeys = keys;
