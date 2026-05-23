export interface AppStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const Storage: AppStorage;
