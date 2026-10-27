/**
 * Shared hostname extraction for grouping URL lists by host
 * (All URLs detail page and the pair-diff unique-URL lists).
 */

/** Extract a display hostname from a URL; falls back for unparseable values. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || "(no host)";
  } catch {
    return "(invalid URL)";
  }
}

/**
 * Group items by the hostname of a URL accessor, preserving the input order
 * of items **within** each host group. Host groups are returned sorted
 * alphabetically by host.
 */
export function groupByHostname<T>(
  items: T[],
  urlOf: (item: T) => string,
): Array<{ host: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const host = hostOf(urlOf(item));
    const list = map.get(host);
    if (list) list.push(item);
    else map.set(host, [item]);
  }
  return Array.from(map.entries())
    .map(([host, groupItems]) => ({ host, items: groupItems }))
    .sort((a, b) => a.host.localeCompare(b.host));
}
