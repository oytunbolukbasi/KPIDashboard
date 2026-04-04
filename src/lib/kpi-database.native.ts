import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import type { KPIEntry } from '@/types/kpi';

let db: SQLite.SQLiteDatabase | null = null;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('kpi_dashboard.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS kpi_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        downloadIos REAL NOT NULL DEFAULT 0,
        downloadAndroid REAL NOT NULL DEFAULT 0,
        activeUsers REAL NOT NULL DEFAULT 0,
        pushOptInIos REAL NOT NULL DEFAULT 0,
        pushOptInAndroid REAL NOT NULL DEFAULT 0,
        mau REAL NOT NULL DEFAULT 0,
        dau REAL NOT NULL DEFAULT 0
      );
    `);
  }
  return db;
}

// Parse DD.MM.YYYY to sortable YYYY-MM-DD
function dateToSortable(dateStr: string): string {
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
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
  const database = await getDB();
  const rows = await database.getAllAsync<KPIEntry>(
    `SELECT * FROM kpi_entries`
  );
  return sortByDate(rows);
}

export async function addEntry(entry: Omit<KPIEntry, 'id'>): Promise<KPIEntry> {
  const database = await getDB();
  const id = generateId();
  await database.runAsync(
    `INSERT INTO kpi_entries (id, date, downloadIos, downloadAndroid, activeUsers, pushOptInIos, pushOptInAndroid, mau, dau)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, entry.date, entry.downloadIos, entry.downloadAndroid, entry.activeUsers, entry.pushOptInIos, entry.pushOptInAndroid, entry.mau, entry.dau]
  );
  return { id, ...entry };
}

export async function updateEntry(id: string, entry: Omit<KPIEntry, 'id'>): Promise<void> {
  const database = await getDB();
  await database.runAsync(
    `UPDATE kpi_entries SET date=?, downloadIos=?, downloadAndroid=?, activeUsers=?, pushOptInIos=?, pushOptInAndroid=?, mau=?, dau=? WHERE id=?`,
    [entry.date, entry.downloadIos, entry.downloadAndroid, entry.activeUsers, entry.pushOptInIos, entry.pushOptInAndroid, entry.mau, entry.dau, id]
  );
}

export async function deleteEntry(id: string): Promise<void> {
  const database = await getDB();
  await database.runAsync(`DELETE FROM kpi_entries WHERE id=?`, [id]);
}

export async function deleteAllEntries(): Promise<void> {
  const database = await getDB();
  await database.runAsync(`DELETE FROM kpi_entries`);
}
