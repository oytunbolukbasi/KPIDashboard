/**
 * Firestore-backed KPI database.
 * Replaces the SQLite implementation — same interface as kpi-database.native.ts
 */
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { KPIEntry } from '@/types/kpi';

const COL = 'kpi_entries';

function toEntry(id: string, data: any): KPIEntry {
  return {
    id,
    date: data.date ?? '',
    downloadIos: data.downloadIos ?? 0,
    downloadAndroid: data.downloadAndroid ?? 0,
    activeUsers: data.activeUsers ?? 0,
    pushOptInIos: data.pushOptInIos ?? 0,
    pushOptInAndroid: data.pushOptInAndroid ?? 0,
    mau: data.mau ?? 0,
    dau: data.dau ?? 0,
  };
}

export async function getAllEntries(): Promise<KPIEntry[]> {
  const q = query(collection(db, COL), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toEntry(d.id, d.data()));
}

export async function addEntry(entry: Omit<KPIEntry, 'id'>): Promise<KPIEntry> {
  const docRef = await addDoc(collection(db, COL), {
    ...entry,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: docRef.id, ...entry };
}

export async function updateEntry(id: string, entry: Omit<KPIEntry, 'id'>): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...entry,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export async function deleteAllEntries(): Promise<void> {
  const snap = await getDocs(collection(db, COL));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
