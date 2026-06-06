import type { EntryRecord, HarHeader, HarStore, HarTimings } from "@/types/har";
import {
  computePerfStats,
  normalizeTiming,
  percentile,
} from "@/utils/perfStats";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimeRank =
  | "faster-than-p50"
  | "between-p50-p95"
  | "slower-than-p95"
  | "slower-than-p99";

export type SizeRank = "below-median" | "above-median" | "top-decile";

export interface EntryComparison {
  /** Number of entries used as the population (excludes the entry itself). */
  samples: number;
  /** Median (P50) time across the file, in ms. */
  p50: number;
  /** P95 time across the file, in ms. */
  p95: number;
  /** P99 time across the file, in ms. */
  p99: number;
  /** Median content size across the file, in bytes. */
  medianSize: number;
  /** 90th-percentile content size across the file, in bytes. */
  p90Size: number;
  /** Where this entry's time sits relative to the percentiles. */
  timeRank: TimeRank;
  /** Where this entry's content size sits relative to the size distribution. */
  sizeRank: SizeRank;
}

// ---------------------------------------------------------------------------
// Store lookups
// ---------------------------------------------------------------------------

/** Bounds-checked entry lookup by (file, index) segments. */
export function getEntryByPosition(
  store: HarStore | null,
  fileIndex: number,
  indexInFile: number,
): EntryRecord | null {
  if (!store) return null;
  if (!Number.isInteger(fileIndex) || fileIndex < 0) return null;
  if (!Number.isInteger(indexInFile) || indexInFile < 0) return null;
  const analysis = store.analyses[fileIndex];
  if (!analysis) return null;
  return analysis.entries[indexInFile] ?? null;
}

/** Reverse lookup: the position of `entry` within its file's entries array. */
export function findIndexInFile(
  store: HarStore | null,
  fileIndex: number,
  entry: EntryRecord,
): number | null {
  if (!store) return null;
  const analysis = store.analyses[fileIndex];
  if (!analysis) return null;
  const idx = analysis.entries.indexOf(entry);
  return idx >= 0 ? idx : null;
}

// ---------------------------------------------------------------------------
// Comparison: this entry vs. file aggregates
// ---------------------------------------------------------------------------

/**
 * Rank the entry's `time` and `contentSize` against the rest of its file.
 * The entry itself is excluded from the population so comparisons against
 * single-entry files (or against the entry's own value) stay meaningful.
 */
export function compareEntryToFile(
  entry: EntryRecord,
  fileEntries: EntryRecord[],
): EntryComparison {
  const others = fileEntries.filter((e) => e !== entry);
  const stats = computePerfStats(others);
  const sortedSizes = others.map((e) => e.contentSize).sort((a, b) => a - b);
  const medianSize = percentile(sortedSizes, 50);
  const p90Size = percentile(sortedSizes, 90);

  let timeRank: TimeRank;
  if (entry.time > stats.p99) timeRank = "slower-than-p99";
  else if (entry.time > stats.p95) timeRank = "slower-than-p95";
  else if (entry.time > stats.p50) timeRank = "between-p50-p95";
  else timeRank = "faster-than-p50";

  let sizeRank: SizeRank;
  if (entry.contentSize > p90Size) sizeRank = "top-decile";
  else if (entry.contentSize > medianSize) sizeRank = "above-median";
  else sizeRank = "below-median";

  return {
    samples: others.length,
    p50: stats.p50,
    p95: stats.p95,
    p99: stats.p99,
    medianSize,
    p90Size,
    timeRank,
    sizeRank,
  };
}

// ---------------------------------------------------------------------------
// Header + URL helpers
// ---------------------------------------------------------------------------

/** Case-insensitive header lookup. Returns the first matching value, or null. */
export function findHeader(headers: HarHeader[], name: string): string | null {
  const lc = name.toLowerCase();
  const hit = headers.find((h) => h.name.toLowerCase() === lc);
  return hit ? hit.value : null;
}

/** Parse the query string portion of a URL into an ordered name/value list. */
export function parseUrlQuery(
  url: string,
): Array<{ name: string; value: string }> {
  try {
    const u = new URL(url);
    return Array.from(u.searchParams.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Derived performance hints
// ---------------------------------------------------------------------------

/**
 * Effective response-body throughput, in KB/s, derived from `contentSize`
 * and the `receive` timing phase. Returns null when receive is unknown
 * (HAR `-1` sentinel) or zero, or when the body is empty.
 */
export function throughputKBps(entry: EntryRecord): number | null {
  const receiveMs = normalizeTiming(entry.timings.receive);
  if (receiveMs <= 0) return null;
  if (entry.contentSize <= 0) return null;
  return entry.contentSize / 1024 / (receiveMs / 1000);
}

/**
 * True when both DNS and Connect phases are absent (HAR `-1` or zero), which
 * indicates the browser reused an existing connection rather than dialing
 * a fresh one.
 */
export function reusedConnection(timings: HarTimings): boolean {
  return (
    normalizeTiming(timings.dns) === 0 && normalizeTiming(timings.connect) === 0
  );
}
