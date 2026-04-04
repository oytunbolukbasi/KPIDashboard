import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { KPIEntry, KPIEntryComputed } from '@/types/kpi';
import { computeAllEntries } from '@/types/kpi';
import * as KPIDatabase from '@/lib/kpi-database';

type KPIContextType = {
  entries: KPIEntry[];
  computed: KPIEntryComputed[];
  loading: boolean;
  refresh: () => Promise<void>;
  addEntry: (entry: Omit<KPIEntry, 'id'>) => Promise<void>;
  updateEntry: (id: string, entry: Omit<KPIEntry, 'id'>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
};

const KPIContext = createContext<KPIContextType | undefined>(undefined);

export function KPIProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<KPIEntry[]>([]);
  const [computed, setComputed] = useState<KPIEntryComputed[]>([]);
  const [loading, setLoading] = useState(true);

const SEED_DATA: Omit<KPIEntry, 'id'>[] = [
  { date: '1.10.2025', downloadIos: 182070, downloadAndroid: 208130, activeUsers: 187810, pushOptInIos: 129390, pushOptInAndroid: 171020, mau: 188290, dau: 100200 },
  { date: '31.10.2025', downloadIos: 182890, downloadAndroid: 207100, activeUsers: 183510, pushOptInIos: 129580, pushOptInAndroid: 170260, mau: 183260, dau: 99170 },
  { date: '30.11.2025', downloadIos: 183530, downloadAndroid: 205260, activeUsers: 178440, pushOptInIos: 129800, pushOptInAndroid: 169090, mau: 178570, dau: 96080 },
  { date: '31.12.2025', downloadIos: 184260, downloadAndroid: 204290, activeUsers: 166760, pushOptInIos: 130250, pushOptInAndroid: 168590, mau: 174426, dau: 97629 },
  { date: '1.01.2026', downloadIos: 184580, downloadAndroid: 204440, activeUsers: 191640, pushOptInIos: 130490, pushOptInAndroid: 168750, mau: 191640, dau: 102980 },
  { date: '2.01.2026', downloadIos: 187320, downloadAndroid: 203650, activeUsers: 180254, pushOptInIos: 131620, pushOptInAndroid: 168300, mau: 181010, dau: 97110 },
];

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      let data = await KPIDatabase.getAllEntries();
      
      if (data.length === 0) {
        // Auto-seed table if no entries exist
        for (const entry of SEED_DATA) {
          await KPIDatabase.addEntry(entry);
        }
        data = await KPIDatabase.getAllEntries();
      }

      setEntries(data);
      setComputed(computeAllEntries(data));
    } catch (e) {
      console.error('Failed to load KPI entries:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addEntry = useCallback(async (entry: Omit<KPIEntry, 'id'>) => {
    await KPIDatabase.addEntry(entry);
    await refresh();
  }, [refresh]);

  const updateEntry = useCallback(async (id: string, entry: Omit<KPIEntry, 'id'>) => {
    await KPIDatabase.updateEntry(id, entry);
    await refresh();
  }, [refresh]);

  const deleteEntry = useCallback(async (id: string) => {
    await KPIDatabase.deleteEntry(id);
    await refresh();
  }, [refresh]);

  const deleteAll = useCallback(async () => {
    await KPIDatabase.deleteAllEntries();
    await refresh();
  }, [refresh]);

  return (
    <KPIContext.Provider value={{ entries, computed, loading, refresh, addEntry, updateEntry, deleteEntry, deleteAll }}>
      {children}
    </KPIContext.Provider>
  );
}

export const useKPI = () => {
  const context = useContext(KPIContext);
  if (!context) throw new Error('useKPI must be used within a KPIProvider');
  return context;
};
