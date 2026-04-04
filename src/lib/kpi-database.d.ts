import type { KPIEntry } from '@/types/kpi';

export declare function getAllEntries(): Promise<KPIEntry[]>;
export declare function addEntry(entry: Omit<KPIEntry, 'id'>): Promise<KPIEntry>;
export declare function updateEntry(id: string, entry: Omit<KPIEntry, 'id'>): Promise<void>;
export declare function deleteEntry(id: string): Promise<void>;
export declare function deleteAllEntries(): Promise<void>;
