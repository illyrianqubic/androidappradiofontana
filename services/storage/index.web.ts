// Web storage — only the React Query cache persister consumes this now.

const keys = {
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

export const queryStorage = {
  getItem: (key: string) => getStorageItem(`${keys.queryCache}.${key}`),
  setItem: (key: string, value: string) => setStorageItem(`${keys.queryCache}.${key}`, value),
  removeItem: (key: string) => removeStorageItem(`${keys.queryCache}.${key}`),
};
