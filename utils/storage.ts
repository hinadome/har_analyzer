import { get, set, del } from 'idb-keyval';
import { HarStore } from '@/types/har';

const STORAGE_KEY = 'har_analyzer_data';

export async function saveHarStoreAsync(store: HarStore): Promise<void> {
  try {
    await set(STORAGE_KEY, store);
  } catch (err) {
    console.error('Failed to save HAR data to IndexedDB:', err);
    throw new Error('Storage error. Could not persist data to database.');
  }
}

export async function loadHarStoreAsync(): Promise<HarStore | null> {
  try {
    const data = await get<HarStore>(STORAGE_KEY);
    return data ?? null;
  } catch (err) {
    console.error('Failed to load HAR data from IndexedDB:', err);
    return null;
  }
}

export async function clearHarStoreAsync(): Promise<void> {
  await del(STORAGE_KEY);
}
