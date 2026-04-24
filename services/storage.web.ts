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

const memoryStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return memoryStore.get(key) ?? null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function setStorageItem(key: string, value: string) {
  if (typeof window === 'undefined' || !window.localStorage) {
    memoryStore.set(key, value);
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

function removeStorageItem(key: string) {
  if (typeof window === 'undefined' || !window.localStorage) {
    memoryStore.delete(key);
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    memoryStore.delete(key);
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
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
  setStorageItem(key, JSON.stringify(value));
}

export function getSavedArticles(): SavedArticle[] {
  return parseJson<SavedArticle[]>(getStorageItem(keys.bookmarks), []);
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
  return parseJson<ListeningHistoryItem[]>(getStorageItem(keys.listeningHistory), []);
}

export function addListeningHistory(item: ListeningHistoryItem) {
  const current = getListeningHistory().filter((entry) => entry.id !== item.id);
  current.unshift(item);
  saveJson(keys.listeningHistory, current.slice(0, 30));
}

export function clearListeningHistory() {
  removeStorageItem(keys.listeningHistory);
}

export function setLastBreakingId(id: string) {
  setStorageItem(keys.lastBreakingId, id);
}

export function getLastBreakingId(): string | undefined {
  return getStorageItem(keys.lastBreakingId) ?? undefined;
}

export const queryStorage = {
  getItem: (key: string) => getStorageItem(`${keys.queryCache}.${key}`),
  setItem: (key: string, value: string) => {
    setStorageItem(`${keys.queryCache}.${key}`, value);
  },
  removeItem: (key: string) => {
    removeStorageItem(`${keys.queryCache}.${key}`);
  },
};
