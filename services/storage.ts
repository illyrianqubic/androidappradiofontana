import { Platform } from 'react-native';

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
};

function createStore(): KeyValueStore {
  try {
    const { MMKV } = require('react-native-mmkv') as {
      MMKV: new (config?: {
        id?: string;
        encryptionKey?: string;
      }) => {
        getString: (key: string) => string | undefined;
        set: (key: string, value: string) => void;
        delete: (key: string) => void;
      };
    };

    const mmkv = new MMKV(
      Platform.OS === 'web'
        ? {
            id: 'radio-fontana-mmkv',
          }
        : {
            id: 'radio-fontana-mmkv',
            encryptionKey: 'radio-fontana-988fm',
          },
    );

    return {
      getString: (key: string) => mmkv.getString(key),
      set: (key: string, value: string) => {
        mmkv.set(key, value);
      },
      delete: (key: string) => {
        mmkv.delete(key);
      },
    };
  } catch {
    // Allows Expo Go sessions to run even when MMKV native bindings are unavailable.
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
  }
}

const store = createStore();

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

export function getSavedArticles(): SavedArticle[] {
  return parseJson<SavedArticle[]>(store.getString(keys.bookmarks), []);
}

export function isArticleSaved(slug: string): boolean {
  return getSavedArticles().some((item) => item.slug === slug);
}

function upsertSavedArticle(article: SavedArticle): SavedArticle[] {
  const current = getSavedArticles();
  const idx = current.findIndex((item) => item.slug === article.slug);

  if (idx >= 0) {
    current[idx] = article;
  } else {
    current.unshift(article);
  }

  saveJson(keys.bookmarks, current);
  return current;
}

function removeSavedArticle(slug: string): SavedArticle[] {
  const next = getSavedArticles().filter((item) => item.slug !== slug);
  saveJson(keys.bookmarks, next);
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

export function getListeningHistory(): ListeningHistoryItem[] {
  return parseJson<ListeningHistoryItem[]>(store.getString(keys.listeningHistory), []);
}

export function addListeningHistory(item: ListeningHistoryItem) {
  const current = getListeningHistory().filter((entry) => entry.id !== item.id);
  current.unshift(item);
  saveJson(keys.listeningHistory, current.slice(0, 30));
}

export function clearListeningHistory() {
  store.delete(keys.listeningHistory);
}

export function setLastBreakingId(id: string) {
  store.set(keys.lastBreakingId, id);
}

export function getLastBreakingId(): string | undefined {
  return store.getString(keys.lastBreakingId);
}

export const queryStorage = {
  getItem: (key: string) => store.getString(`${keys.queryCache}.${key}`) ?? null,
  setItem: (key: string, value: string) => {
    store.set(`${keys.queryCache}.${key}`, value);
  },
  removeItem: (key: string) => {
    store.delete(`${keys.queryCache}.${key}`);
  },
};
