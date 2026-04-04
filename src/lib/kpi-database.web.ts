// Web fallback: uses browser localStorage as a simple key-value store
// serializing KPI entries as JSON arrays
import type { KPIEntry } from '@/types/kpi';

const STORAGE_KEY = 'kpi_entries';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function loadEntries(): KPIEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveEntries(entries: KPIEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

// Sort by date DD.MM.YYYY
function sortByDate(entries: KPIEntry[]): KPIEntry[] {
  return [...entries].sort((a, b) => {
    const [ad, am, ay] = a.date.split('.').map(Number);
    const [bd, bm, by] = b.date.split('.').map(Number);
    return (ay - by) || (am - bm) || (ad - bd);
  });
}

export async function getAllEntries(): Promise<KPIEntry[]> {
  return sortByDate(loadEntries());
}

export async function addEntry(entry: Omit<KPIEntry, 'id'>): Promise<KPIEntry> {
  const entries = loadEntries();
  const newEntry = { id: generateId(), ...entry };
  entries.push(newEntry);
  saveEntries(entries);
  return newEntry;
}

export async function updateEntry(id: string, entry: Omit<KPIEntry, 'id'>): Promise<void> {
  const entries = loadEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx >= 0) {
    entries[idx] = { id, ...entry };
    saveEntries(entries);
  }
}

export async function deleteEntry(id: string): Promise<void> {
  const entries = loadEntries().filter((e) => e.id !== id);
  saveEntries(entries);
}

export async function deleteAllEntries(): Promise<void> {
  window.localStorage.removeItem(STORAGE_KEY);
}
