import type { EntryRecord } from "@/types/har";

/**
 * Free-text filter used by the details (and similar) entry tables:
 * case-insensitive substring on url, contentType, status, harFileName.
 */
export function filterEntriesBySearch(
  entries: EntryRecord[],
  search: string,
): EntryRecord[] {
  if (!search.trim()) return entries;
  const q = search.trim().toLowerCase();
  return entries.filter(
    (e) =>
      e.url.toLowerCase().includes(q) ||
      e.contentType.toLowerCase().includes(q) ||
      String(e.status).includes(q) ||
      e.harFileName.toLowerCase().includes(q),
  );
}
