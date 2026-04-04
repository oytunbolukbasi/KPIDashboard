import "expo-sqlite/localStorage/install";

export const Storage = {
  getItem: (key: string): string | null => {
    try {
      // @ts-ignore - globalThis.localStorage is populated by expo-sqlite on native
      return globalThis.localStorage.getItem(key);
    } catch (e) {
      console.warn('Native Storage error:', e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      // @ts-ignore - globalThis.localStorage is populated by expo-sqlite on native
      globalThis.localStorage.setItem(key, value);
    } catch (e) {
      console.warn('Native Storage error:', e);
    }
  }
};
