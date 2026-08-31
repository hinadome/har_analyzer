import { get, set, del, delMany, setMany, keys } from "idb-keyval";
import type { EntryRecord, HarAnalysis, HarStore } from "@/types/har";
import { newBodyId } from "@/utils/bodyId";
import { normalizeAnalyses } from "@/utils/harParser";

export { newBodyId } from "@/utils/bodyId";

export const HAR_STORE_VERSION = 2;
export const STORAGE_KEY = "har_analyzer_data";
export const BODY_KEY_PREFIX = "har_analyzer_body:";

export function bodyStorageKey(bodyId: string): string {
  return `${BODY_KEY_PREFIX}${bodyId}`;
}

/** Collect bodyId values from analyses (for delete-on-remove). */
export function collectBodyIds(analyses: HarAnalysis[]): string[] {
  const ids: string[] = [];
  for (const a of analyses) {
    for (const e of a.entries) {
      if (e.bodyId) ids.push(e.bodyId);
    }
  }
  return ids;
}

/**
 * Build the hot blob for IndexedDB: version + analyses with responseContent
 * stripped. Returns body pairs that should be written to cold keys.
 * Does not mutate the input store (safe to keep bodies in memCache).
 */
export function prepareStoreForPersist(store: HarStore): {
  hot: HarStore;
  bodies: Array<[string, string]>;
} {
  const bodies: Array<[string, string]> = [];
  const analyses = store.analyses.map((a) => ({
    ...a,
    entries: a.entries.map((e, indexInFile) => {
      const withIndex = {
        ...e,
        indexInFile: e.indexInFile ?? indexInFile,
      };
      if (e.responseContent !== undefined && e.bodyId) {
        bodies.push([bodyStorageKey(e.bodyId), e.responseContent]);
      }
      if (e.responseContent === undefined) {
        return withIndex;
      }
      const { responseContent: _omit, ...rest } = withIndex;
      return rest;
    }),
  }));
  return {
    hot: { version: HAR_STORE_VERSION, analyses },
    bodies,
  };
}

/** Migrate a legacy v1 (or unversioned) store that still has inline bodies. */
export function migrateLegacyStore(raw: HarStore): {
  hot: HarStore;
  bodies: Array<[string, string]>;
} {
  const bodies: Array<[string, string]> = [];
  const analyses = raw.analyses.map((a) => ({
    ...a,
    entries: a.entries.map((e, indexInFile) => {
      const withIndex = {
        ...e,
        indexInFile: e.indexInFile ?? indexInFile,
      };
      if (e.responseContent === undefined) {
        return {
          ...withIndex,
          hasResponseBody: withIndex.hasResponseBody ?? false,
        };
      }
      const bodyId = withIndex.bodyId ?? newBodyId();
      bodies.push([bodyStorageKey(bodyId), e.responseContent]);
      const { responseContent: _omit, ...rest } = withIndex;
      return {
        ...rest,
        bodyId,
        hasResponseBody: true,
      };
    }),
  }));
  return {
    hot: { version: HAR_STORE_VERSION, analyses },
    bodies,
  };
}

export async function saveHarStoreAsync(store: HarStore): Promise<void> {
  try {
    const { hot, bodies } = prepareStoreForPersist(store);
    if (bodies.length > 0) {
      await setMany(bodies);
    }
    await set(STORAGE_KEY, hot);
  } catch (err) {
    console.error("Failed to save HAR data to IndexedDB:", err);
    throw new Error("Storage error. Could not persist data to database.");
  }
}

export async function loadHarStoreAsync(): Promise<HarStore | null> {
  try {
    const data = await get<HarStore>(STORAGE_KEY);
    if (!data) return null;

    const version = data.version ?? 1;
    if (version >= HAR_STORE_VERSION) {
      return normalizeStore(data);
    }

    // Legacy inline bodies → split into cold keys, rewrite hot blob.
    const { hot, bodies } = migrateLegacyStore(data);
    if (bodies.length > 0) {
      await setMany(bodies);
    }
    await set(STORAGE_KEY, hot);
    return normalizeStore(hot);
  } catch (err) {
    console.error("Failed to load HAR data from IndexedDB:", err);
    return null;
  }
}

export async function loadEntryBodyAsync(
  bodyId: string | undefined,
): Promise<string | undefined> {
  if (!bodyId) return undefined;
  try {
    const text = await get<string>(bodyStorageKey(bodyId));
    return text;
  } catch (err) {
    console.error("Failed to load entry body:", err);
    return undefined;
  }
}

export async function deleteBodiesAsync(bodyIds: string[]): Promise<void> {
  if (bodyIds.length === 0) return;
  try {
    await delMany(bodyIds.map(bodyStorageKey));
  } catch (err) {
    console.error("Failed to delete entry bodies:", err);
  }
}

export async function clearHarStoreAsync(): Promise<void> {
  try {
    const allKeys = await keys();
    const bodyKeys = allKeys.filter(
      (k) => typeof k === "string" && k.startsWith(BODY_KEY_PREFIX),
    );
    if (bodyKeys.length > 0) {
      await delMany(bodyKeys);
    }
    await del(STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear HAR data:", err);
    await del(STORAGE_KEY);
  }
}

/** Attach a loaded body onto a shallow copy of the entry (for UI). */
export function withResponseContent(
  entry: EntryRecord,
  text: string | undefined,
): EntryRecord {
  if (text === undefined) return entry;
  return { ...entry, responseContent: text };
}

function normalizeStore(store: HarStore): HarStore {
  return { ...store, analyses: normalizeAnalyses(store.analyses) };
}
