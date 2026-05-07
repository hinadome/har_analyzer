import type { EntryRecord, HarTimings } from "@/types/har";
import { stripQuery } from "@/utils/contentDiff";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimingPhaseKey =
  | "dns"
  | "connect"
  | "ssl"
  | "send"
  | "wait"
  | "receive";

export const TIMING_PHASE_KEYS: readonly TimingPhaseKey[] = [
  "dns",
  "connect",
  "ssl",
  "send",
  "wait",
  "receive",
] as const;

export interface PerfStats {
  count: number;
  totalBytes: number;
  errorCount: number;
  errorRate: number;
  avgTime: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  maxTime: number;
  /** Wall-clock span: max(startedDateTime + time) − min(startedDateTime), in ms */
  wallClockMs: number;
}

export interface TimingAvgs {
  avgs: Record<TimingPhaseKey, number>;
  total: number;
}

export type HistogramScale = "log" | "linear";

export interface HistogramResult {
  /** bucket edges; length = bins + 1 */
  edges: number[];
  /** per-file counts; outer length = files.length, inner length = bins */
  counts: number[][];
  scale: HistogramScale;
}

export interface RegressionRow {
  /** match key (path or full URL, depending on settings) */
  key: string;
  /** representative full URL for display */
  url: string;
  baseTime: number;
  cmpTime: number;
  deltaTime: number;
  baseSize: number;
  cmpSize: number;
  deltaSize: number;
}

export interface UniqueUrlRow {
  /** match key (path or full URL, depending on settings) */
  key: string;
  /** representative full URL for display */
  url: string;
  /** how many times this URL was requested in the run it appears in */
  count: number;
  /** median response time across all of this URL's requests */
  medianTime: number;
  /** median response body size across all of this URL's requests */
  medianSize: number;
}

export interface RegressionResult {
  regressions: RegressionRow[];
  improvements: RegressionRow[];
  /** URLs present only in the compare run (with their stats from compare) */
  onlyInCompare: UniqueUrlRow[];
  /** URLs present only in the base run (with their stats from base) */
  onlyInBase: UniqueUrlRow[];
}

export type UrlMatchKey = "path" | "full";

export interface ContentTypePerfRow {
  contentType: string;
  count: number;
  totalBytes: number;
  avgTime: number;
  p95Time: number;
}

export interface ContentTypeDeltaRow {
  contentType: string;
  base: ContentTypePerfRow | null;
  cmp: ContentTypePerfRow | null;
  /** cmp - base for each numeric metric; null fields default to 0 in the diff */
  delta: {
    count: number;
    totalBytes: number;
    avgTime: number;
    p95Time: number;
  };
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** HAR timings use -1 as the "N/A" sentinel; treat both -1 and undefined as 0. */
export function normalizeTiming(v: number | undefined): number {
  return typeof v === "number" && v > 0 ? v : 0;
}

/** Network failure (status 0) and 4xx/5xx all count as errors. */
export function isErrorStatus(code: number): boolean {
  return code === 0 || code >= 400;
}

/**
 * Inclusive nearest-rank percentile on an already-sorted ascending array.
 * Returns 0 for an empty array. p is in [0, 100].
 */
export function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const rank = Math.ceil((p / 100) * n);
  const idx = Math.min(Math.max(rank - 1, 0), n - 1);
  return sortedAsc[idx];
}

// ---------------------------------------------------------------------------
// Aggregate stats
// ---------------------------------------------------------------------------

export function computePerfStats(entries: EntryRecord[]): PerfStats {
  const n = entries.length;
  if (n === 0) {
    return {
      count: 0,
      totalBytes: 0,
      errorCount: 0,
      errorRate: 0,
      avgTime: 0,
      p50: 0,
      p75: 0,
      p95: 0,
      p99: 0,
      maxTime: 0,
      wallClockMs: 0,
    };
  }
  const times = entries.map((e) => e.time).sort((a, b) => a - b);
  const totalBytes = entries.reduce((s, e) => s + (e.contentSize || 0), 0);
  const errorCount = entries.reduce(
    (s, e) => s + (isErrorStatus(e.status) ? 1 : 0),
    0,
  );
  const sumTime = times.reduce((s, t) => s + t, 0);

  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const e of entries) {
    const t = Date.parse(e.startedDateTime);
    if (!Number.isFinite(t)) continue;
    if (t < minStart) minStart = t;
    const end = t + (e.time || 0);
    if (end > maxEnd) maxEnd = end;
  }
  const wallClockMs =
    Number.isFinite(minStart) && Number.isFinite(maxEnd)
      ? Math.max(0, maxEnd - minStart)
      : 0;

  return {
    count: n,
    totalBytes,
    errorCount,
    errorRate: (errorCount / n) * 100,
    avgTime: sumTime / n,
    p50: percentile(times, 50),
    p75: percentile(times, 75),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    maxTime: times[times.length - 1],
    wallClockMs,
  };
}

export function computeTimingAvgs(entries: EntryRecord[]): TimingAvgs {
  const empty: Record<TimingPhaseKey, number> = {
    dns: 0,
    connect: 0,
    ssl: 0,
    send: 0,
    wait: 0,
    receive: 0,
  };
  const n = entries.length;
  if (n === 0) return { avgs: empty, total: 0 };
  const sum: Record<TimingPhaseKey, number> = { ...empty };
  for (const e of entries) {
    const t: HarTimings = e.timings ?? { send: 0, wait: 0, receive: 0 };
    for (const k of TIMING_PHASE_KEYS) sum[k] += normalizeTiming(t[k]);
  }
  const avgs = { ...empty };
  for (const k of TIMING_PHASE_KEYS) avgs[k] = sum[k] / n;
  const total = TIMING_PHASE_KEYS.reduce((s, k) => s + avgs[k], 0);
  return { avgs, total };
}

// ---------------------------------------------------------------------------
// Histogram with a shared axis across files
// ---------------------------------------------------------------------------

/**
 * Build bucket edges for a numeric range.
 * For `log`, both min and max are clamped to >= 1ms before taking the log so
 * that 0ms entries are placed in the first bucket.
 */
export function buildBucketEdges(
  minVal: number,
  maxVal: number,
  bins: number,
  scale: HistogramScale,
): number[] {
  const safeBins = Math.max(1, Math.floor(bins));
  if (!(maxVal > minVal)) {
    const v = Math.max(0, minVal);
    return Array.from({ length: safeBins + 1 }, () => v);
  }
  if (scale === "linear") {
    const step = (maxVal - minVal) / safeBins;
    return Array.from({ length: safeBins + 1 }, (_, i) => minVal + step * i);
  }
  const lo = Math.max(1, minVal);
  const hi = Math.max(lo + 1, maxVal);
  const a = Math.log(lo);
  const b = Math.log(hi);
  const step = (b - a) / safeBins;
  return Array.from({ length: safeBins + 1 }, (_, i) => Math.exp(a + step * i));
}

/** Place a single value into a bucket index given monotonically increasing edges. */
export function bucketIndex(value: number, edges: number[]): number {
  const lastBin = edges.length - 2;
  if (lastBin < 0) return 0;
  if (value <= edges[0]) return 0;
  if (value >= edges[edges.length - 1]) return lastBin;
  for (let i = 0; i < edges.length - 1; i++) {
    if (value >= edges[i] && value < edges[i + 1]) return i;
  }
  return lastBin;
}

/**
 * Compute a histogram with a single shared axis derived from the union of all
 * provided files. Empty input falls back to a single zero-bucket result.
 */
export function computeHistogram(
  filesEntries: EntryRecord[][],
  options: { scale: HistogramScale; bins: number },
): HistogramResult {
  const { scale, bins } = options;
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const list of filesEntries) {
    for (const e of list) {
      const t = e.time;
      if (typeof t !== "number" || !Number.isFinite(t)) continue;
      if (t < minVal) minVal = t;
      if (t > maxVal) maxVal = t;
    }
  }
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
    return { edges: [0, 0], counts: filesEntries.map(() => [0]), scale };
  }
  const edges = buildBucketEdges(minVal, maxVal, bins, scale);
  const counts = filesEntries.map((list) => {
    const c = new Array(Math.max(1, edges.length - 1)).fill(0);
    for (const e of list) {
      if (typeof e.time !== "number" || !Number.isFinite(e.time)) continue;
      c[bucketIndex(e.time, edges)] += 1;
    }
    return c;
  });
  return { edges, counts, scale };
}

// ---------------------------------------------------------------------------
// Regressions / improvements between two files
// ---------------------------------------------------------------------------

function urlKey(url: string, mode: UrlMatchKey): string {
  return mode === "path" ? stripQuery(url) : url;
}

/**
 * For URLs that appear in both runs, compute Δtime and Δsize using the median
 * value per URL on each side. Median is robust against the same URL being
 * requested multiple times within a single file.
 */
export function computeRegressions(
  baseEntries: EntryRecord[],
  cmpEntries: EntryRecord[],
  options: { matchKey: UrlMatchKey },
): RegressionResult {
  const { matchKey } = options;
  const groupBy = (list: EntryRecord[]) => {
    const m = new Map<
      string,
      { url: string; times: number[]; sizes: number[] }
    >();
    for (const e of list) {
      const k = urlKey(e.url, matchKey);
      let g = m.get(k);
      if (!g) {
        g = { url: e.url, times: [], sizes: [] };
        m.set(k, g);
      }
      g.times.push(e.time || 0);
      g.sizes.push(e.contentSize || 0);
    }
    return m;
  };
  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  const baseMap = groupBy(baseEntries);
  const cmpMap = groupBy(cmpEntries);

  const rows: RegressionRow[] = [];
  for (const [k, b] of baseMap) {
    const c = cmpMap.get(k);
    if (!c) continue;
    const baseTime = median(b.times);
    const cmpTime = median(c.times);
    const baseSize = median(b.sizes);
    const cmpSize = median(c.sizes);
    rows.push({
      key: k,
      url: c.url || b.url,
      baseTime,
      cmpTime,
      deltaTime: cmpTime - baseTime,
      baseSize,
      cmpSize,
      deltaSize: cmpSize - baseSize,
    });
  }

  const toUniqueRow = (
    k: string,
    g: { url: string; times: number[]; sizes: number[] },
  ): UniqueUrlRow => ({
    key: k,
    url: g.url,
    count: g.times.length,
    medianTime: median(g.times),
    medianSize: median(g.sizes),
  });

  const onlyInCompare: UniqueUrlRow[] = [];
  for (const [k, c] of cmpMap)
    if (!baseMap.has(k)) onlyInCompare.push(toUniqueRow(k, c));
  const onlyInBase: UniqueUrlRow[] = [];
  for (const [k, b] of baseMap)
    if (!cmpMap.has(k)) onlyInBase.push(toUniqueRow(k, b));

  const byMedianTimeDesc = (a: UniqueUrlRow, b: UniqueUrlRow) =>
    b.medianTime - a.medianTime;

  const regressions = [...rows]
    .filter((r) => r.deltaTime > 0)
    .sort((a, b) => b.deltaTime - a.deltaTime);
  const improvements = [...rows]
    .filter((r) => r.deltaTime < 0)
    .sort((a, b) => a.deltaTime - b.deltaTime);
  return {
    regressions,
    improvements,
    onlyInCompare: onlyInCompare.sort(byMedianTimeDesc),
    onlyInBase: onlyInBase.sort(byMedianTimeDesc),
  };
}

// ---------------------------------------------------------------------------
// Per content-type aggregation
// ---------------------------------------------------------------------------

export function computeContentTypePerf(
  entries: EntryRecord[],
): ContentTypePerfRow[] {
  const groups = new Map<
    string,
    { count: number; totalBytes: number; times: number[] }
  >();
  for (const e of entries) {
    const ct = e.contentType || "unknown";
    let g = groups.get(ct);
    if (!g) {
      g = { count: 0, totalBytes: 0, times: [] };
      groups.set(ct, g);
    }
    g.count += 1;
    g.totalBytes += e.contentSize || 0;
    g.times.push(e.time || 0);
  }
  const rows: ContentTypePerfRow[] = [];
  for (const [contentType, g] of groups) {
    const sorted = [...g.times].sort((a, b) => a - b);
    const avg = sorted.length
      ? sorted.reduce((s, t) => s + t, 0) / sorted.length
      : 0;
    rows.push({
      contentType,
      count: g.count,
      totalBytes: g.totalBytes,
      avgTime: avg,
      p95Time: percentile(sorted, 95),
    });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

// ---------------------------------------------------------------------------
// Per content-type delta (pair mode)
// ---------------------------------------------------------------------------

/**
 * Diff per-content-type performance between two runs. Rows cover the union of
 * content types from both sides; missing sides yield `null` for that side and
 * are treated as 0 in the delta. Sorted by |Δcount| desc so the biggest movers
 * surface first.
 */
export function computeContentTypeDelta(
  baseEntries: EntryRecord[],
  cmpEntries: EntryRecord[],
): ContentTypeDeltaRow[] {
  const byType = (rows: ContentTypePerfRow[]) => {
    const m = new Map<string, ContentTypePerfRow>();
    for (const r of rows) m.set(r.contentType, r);
    return m;
  };
  const baseMap = byType(computeContentTypePerf(baseEntries));
  const cmpMap = byType(computeContentTypePerf(cmpEntries));
  const allTypes = new Set<string>([...baseMap.keys(), ...cmpMap.keys()]);

  const rows: ContentTypeDeltaRow[] = [];
  for (const ct of allTypes) {
    const base = baseMap.get(ct) ?? null;
    const cmp = cmpMap.get(ct) ?? null;
    const b = base ?? { count: 0, totalBytes: 0, avgTime: 0, p95Time: 0 };
    const c = cmp ?? { count: 0, totalBytes: 0, avgTime: 0, p95Time: 0 };
    rows.push({
      contentType: ct,
      base,
      cmp,
      delta: {
        count: c.count - b.count,
        totalBytes: c.totalBytes - b.totalBytes,
        avgTime: c.avgTime - b.avgTime,
        p95Time: c.p95Time - b.p95Time,
      },
    });
  }
  rows.sort((a, b) => Math.abs(b.delta.count) - Math.abs(a.delta.count));
  return rows;
}
