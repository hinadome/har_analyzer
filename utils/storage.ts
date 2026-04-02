import { HarStore } from '@/types/har';

const STORAGE_KEY = 'har_analyzer_data';

export function saveHarStore(store: HarStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error('Failed to save HAR data to localStorage:', err);
    throw new Error('Storage quota exceeded. Try uploading smaller files.');
  }
}

export function loadHarStore(): HarStore | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data) as HarStore;
  } catch (err) {
    console.error('Failed to load HAR data from localStorage:', err);
    return null;
  }
}

export function clearHarStore(): void {
  localStorage.removeItem(STORAGE_KEY);
}
