export interface KPIEntry {
  id: string;
  date: string; // DD.MM.YYYY
  downloadIos: number;
  downloadAndroid: number;
  activeUsers: number;
  pushOptInIos: number;
  pushOptInAndroid: number;
  mau: number;
  dau: number;
}

// Computed view model (hesaplanan alanlar dahil)
export interface KPIEntryComputed extends KPIEntry {
  downloadTotal: number;
  downloadChange: number | null;
  activeUsersPercentage: number;
  activeUsersChange: number | null;
  pushOptInTotal: number;
  pushOptInIosPercentage: number;
  pushOptInAndroidPercentage: number;
  pushOptInTotalPercentage: number;
  stickiness: number;
  mauChange: number | null;
  dauChange: number | null;
  stickinessChange: number | null;
}

export function computeKPIEntry(
  entry: KPIEntry,
  prevEntry?: KPIEntry
): KPIEntryComputed {
  const downloadTotal = entry.downloadIos + entry.downloadAndroid;
  const pushOptInTotal = entry.pushOptInIos + entry.pushOptInAndroid;
  const stickiness = entry.mau > 0 ? (entry.dau / entry.mau) * 100 : 0;
  const activeUsersPercentage = downloadTotal > 0 ? (entry.activeUsers / downloadTotal) * 100 : 0;

  let downloadChange: number | null = null;
  let activeUsersChange: number | null = null;
  let mauChange: number | null = null;
  let dauChange: number | null = null;
  let stickinessChange: number | null = null;

  if (prevEntry) {
    const prevTotal = prevEntry.downloadIos + prevEntry.downloadAndroid;
    downloadChange = prevTotal > 0 ? ((downloadTotal - prevTotal) / prevTotal) * 100 : null;
    activeUsersChange = prevEntry.activeUsers > 0
      ? ((entry.activeUsers - prevEntry.activeUsers) / prevEntry.activeUsers) * 100
      : null;
    mauChange = prevEntry.mau > 0 ? ((entry.mau - prevEntry.mau) / prevEntry.mau) * 100 : null;
    dauChange = prevEntry.dau > 0 ? ((entry.dau - prevEntry.dau) / prevEntry.dau) * 100 : null;
    
    const prevStickiness = prevEntry.mau > 0 ? (prevEntry.dau / prevEntry.mau) * 100 : 0;
    stickinessChange = prevStickiness > 0 ? ((stickiness - prevStickiness) / prevStickiness) * 100 : null;
  }

  return {
    ...entry,
    downloadTotal,
    downloadChange,
    activeUsersPercentage,
    activeUsersChange,
    pushOptInTotal,
    pushOptInIosPercentage: pushOptInTotal > 0 ? (entry.pushOptInIos / pushOptInTotal) * 100 : 0,
    pushOptInAndroidPercentage: pushOptInTotal > 0 ? (entry.pushOptInAndroid / pushOptInTotal) * 100 : 0,
    pushOptInTotalPercentage: downloadTotal > 0 ? (pushOptInTotal / downloadTotal) * 100 : 0,
    stickiness,
    mauChange,
    dauChange,
    stickinessChange
  };
}

export function computeAllEntries(entries: KPIEntry[]): KPIEntryComputed[] {
  return entries.map((entry, index) => {
    const prevEntry = index > 0 ? entries[index - 1] : undefined;
    return computeKPIEntry(entry, prevEntry);
  });
}
