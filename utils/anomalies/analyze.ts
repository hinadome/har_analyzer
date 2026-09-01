import { pathKey } from "@/utils/contentDiff";
import { findHeader } from "@/utils/entryStats";
import type { EntryRecord, HarAnalysis } from "@/types/har";
import {
  type AnomalyCategory,
  type AnomalyEntry,
  type AnomaliesFileReport,
  type AnomaliesReport,
  type CachePolicyAnomalyGroup,
  type CachePolicyKind,
  type CategorySlice,
  type EncodingAnomalyGroup,
  type GroupForCategory,
  type FileScope,
  type PathCorrelation,
  type SizeAnomalyGroup,
  type StatusAnomalyGroup,
  collectAnomalyEntries,
  emptyCategorySlice,
} from "./types";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const SIZE_RATIO_THRESHOLD = 2;
export const SIZE_MIN_DELTA_BYTES = 10 * 1024;
export const LARGE_UNCOMPRESSED_BYTES = 50 * 1024;

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

function normalizeHeaderValue(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function encodingKey(entry: EntryRecord): string {
  const raw = findHeader(entry.responseHeaders, "content-encoding");
  if (!raw || !raw.trim()) return "identity";
  return normalizeHeaderValue(raw);
}

export function encodingDisplay(entry: EntryRecord): string {
  const key = encodingKey(entry);
  return key === "identity" ? "none" : key;
}

function cacheControlRaw(entry: EntryRecord): string | null {
  const raw = findHeader(entry.responseHeaders, "cache-control");
  if (!raw || !raw.trim()) return null;
  return raw.trim();
}

function cacheControlKey(entry: EntryRecord): string | null {
  const raw = cacheControlRaw(entry);
  return raw ? normalizeHeaderValue(raw) : null;
}

function varyRaw(entry: EntryRecord): string | null {
  const raw = findHeader(entry.responseHeaders, "vary");
  if (!raw || !raw.trim()) return null;
  return raw.trim();
}

function varyKey(entry: EntryRecord): string | null {
  const raw = varyRaw(entry);
  return raw ? normalizeHeaderValue(raw) : null;
}

function isCompressibleContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase().split(";")[0].trim();
  if (!ct) return false;
  if (ct.startsWith("text/")) return true;
  if (ct === "application/json" || ct === "application/ld+json") return true;
  if (ct === "application/javascript" || ct === "text/javascript") return true;
  if (ct === "application/xml" || ct === "text/xml") return true;
  return false;
}

export function isLargeUncompressed(entry: EntryRecord): boolean {
  if (entry.contentSize < LARGE_UNCOMPRESSED_BYTES) return false;
  const ct = entry.contentType ?? "";
  if (!isCompressibleContentType(ct)) return false;
  return encodingKey(entry) === "identity";
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupByPathname(entries: AnomalyEntry[]): Map<string, AnomalyEntry[]> {
  const byPath = new Map<string, AnomalyEntry[]>();
  for (const e of entries) {
    const pathname = pathKey(e.entry.url);
    const list = byPath.get(pathname) ?? [];
    list.push(e);
    byPath.set(pathname, list);
  }
  return byPath;
}

function sortByEntryCount<T extends { pathname: string; entries: AnomalyEntry[] }>(
  groups: T[],
): T[] {
  return [...groups].sort((a, b) => {
    if (b.entries.length !== a.entries.length) {
      return b.entries.length - a.entries.length;
    }
    return a.pathname.localeCompare(b.pathname);
  });
}

function sliceFromGroups<G extends { entries: AnomalyEntry[] }>(
  groups: G[],
): CategorySlice<G> {
  return {
    groups,
    pathGroupCount: groups.length,
    entryCount: groups.reduce((n, g) => n + g.entries.length, 0),
  };
}

function analyzeStatus(entries: AnomalyEntry[]): CategorySlice<StatusAnomalyGroup> {
  const groups: StatusAnomalyGroup[] = [];
  for (const [pathname, pathEntries] of groupByPathname(entries)) {
    if (pathEntries.length < 2) continue;
    const distinctStatuses = [
      ...new Set(pathEntries.map((e) => e.entry.status)),
    ].sort((a, b) => a - b);
    if (distinctStatuses.length <= 1) continue;
    groups.push({ pathname, entries: pathEntries, distinctStatuses });
  }
  return sliceFromGroups(sortByEntryCount(groups));
}

function analyzeSize(entries: AnomalyEntry[]): CategorySlice<SizeAnomalyGroup> {
  const groups: SizeAnomalyGroup[] = [];
  for (const [pathname, pathEntries] of groupByPathname(entries)) {
    if (pathEntries.length < 2) continue;
    const sized = pathEntries.filter((e) => e.entry.contentSize > 0);
    if (sized.length < 2) continue;
    const sizes = sized.map((e) => e.entry.contentSize);
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    if (minSize <= 0) continue;
    const ratio = maxSize / minSize;
    const delta = maxSize - minSize;
    if (ratio < SIZE_RATIO_THRESHOLD && delta < SIZE_MIN_DELTA_BYTES) continue;
    groups.push({
      pathname,
      entries: pathEntries,
      minSize,
      maxSize,
      ratio,
      delta,
    });
  }
  return sliceFromGroups(sortByEntryCount(groups));
}

function analyzeEncoding(
  entries: AnomalyEntry[],
): CategorySlice<EncodingAnomalyGroup> {
  const groups: EncodingAnomalyGroup[] = [];
  for (const [pathname, pathEntries] of groupByPathname(entries)) {
    const encodingMap = new Map<string, string>();
    for (const e of pathEntries) {
      const key = encodingKey(e.entry);
      if (!encodingMap.has(key)) {
        encodingMap.set(key, encodingDisplay(e.entry));
      }
    }

    if (pathEntries.length >= 2 && encodingMap.size > 1) {
      groups.push({
        pathname,
        entries: pathEntries,
        kind: "encoding-drift",
        distinctEncodings: [...encodingMap.values()],
      });
      continue;
    }

    const large = pathEntries.filter((e) => isLargeUncompressed(e.entry));
    if (large.length > 0) {
      groups.push({
        pathname,
        entries: large,
        kind: "large-uncompressed",
        distinctEncodings: [...encodingMap.values()],
      });
    }
  }
  return sliceFromGroups(sortByEntryCount(groups));
}

function analyzeCachePolicy(
  entries: AnomalyEntry[],
): CategorySlice<CachePolicyAnomalyGroup> {
  const groups: CachePolicyAnomalyGroup[] = [];
  for (const [pathname, pathEntries] of groupByPathname(entries)) {
    if (pathEntries.length < 2) continue;

    const ccMap = new Map<string, string>();
    const varyMap = new Map<string, string>();
    for (const e of pathEntries) {
      const ccK = cacheControlKey(e.entry);
      if (ccK) ccMap.set(ccK, cacheControlRaw(e.entry)!);
      const vK = varyKey(e.entry);
      if (vK) varyMap.set(vK, varyRaw(e.entry)!);
    }

    const ccDrift = ccMap.size > 1;
    const varyDrift = varyMap.size > 1;
    if (!ccDrift && !varyDrift) continue;

    let kind: CachePolicyKind = "cache-control";
    if (ccDrift && varyDrift) kind = "both";
    else if (varyDrift) kind = "vary";

    groups.push({
      pathname,
      entries: pathEntries,
      kind,
      distinctCacheControl: [...ccMap.values()],
      distinctVary: [...varyMap.values()],
    });
  }
  return sliceFromGroups(sortByEntryCount(groups));
}

function buildCorrelations(
  status: CategorySlice<StatusAnomalyGroup>,
  size: CategorySlice<SizeAnomalyGroup>,
  encoding: CategorySlice<EncodingAnomalyGroup>,
  cachePolicy: CategorySlice<CachePolicyAnomalyGroup>,
): PathCorrelation[] {
  const map = new Map<string, Set<AnomalyCategory>>();

  const add = (category: AnomalyCategory, pathname: string) => {
    const set = map.get(pathname) ?? new Set<AnomalyCategory>();
    set.add(category);
    map.set(pathname, set);
  };

  for (const g of status.groups) add("status", g.pathname);
  for (const g of size.groups) add("size", g.pathname);
  for (const g of encoding.groups) add("encoding", g.pathname);
  for (const g of cachePolicy.groups) add("cache-policy", g.pathname);

  return [...map.entries()]
    .map(([pathname, categories]) => ({
      pathname,
      categories: [...categories].sort(),
    }))
    .sort((a, b) => {
      if (b.categories.length !== a.categories.length) {
        return b.categories.length - a.categories.length;
      }
      return a.pathname.localeCompare(b.pathname);
    });
}

function analyzeEntries(entries: AnomalyEntry[]): Omit<
  AnomaliesReport,
  "files"
> {
  const status = analyzeStatus(entries);
  const size = analyzeSize(entries);
  const encoding = analyzeEncoding(entries);
  const cachePolicy = analyzeCachePolicy(entries);
  const correlations = buildCorrelations(status, size, encoding, cachePolicy);

  return {
    status,
    size,
    encoding,
    cachePolicy,
    uniquePathCount: correlations.length,
    correlations,
  };
}

function fileReport(
  analysis: HarAnalysis,
  entries: AnomalyEntry[],
): AnomaliesFileReport {
  const status = analyzeStatus(entries);
  const size = analyzeSize(entries);
  const encoding = analyzeEncoding(entries);
  const cachePolicy = analyzeCachePolicy(entries);
  return {
    fileIndex: analysis.fileIndex,
    fileName: analysis.fileName,
    status,
    size,
    encoding,
    cachePolicy,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function anomalyPathId(pathname: string): string {
  return pathname;
}

export function analyzeStore(analyses: HarAnalysis[]): AnomaliesReport {
  const files: AnomaliesFileReport[] = [];
  for (const analysis of analyses) {
    const entries = collectAnomalyEntries([analysis]);
    files.push(fileReport(analysis, entries));
  }

  const allEntries = collectAnomalyEntries(analyses);
  const merged = analyzeEntries(allEntries);

  return {
    files,
    ...merged,
  };
}

export function scopedCategorySlice<C extends AnomalyCategory>(
  report: AnomaliesReport,
  category: C,
  fileScope: FileScope,
): CategorySlice<GroupForCategory<C>> {
  if (fileScope === "all") {
    switch (category) {
      case "status":
        return report.status as CategorySlice<GroupForCategory<C>>;
      case "size":
        return report.size as CategorySlice<GroupForCategory<C>>;
      case "encoding":
        return report.encoding as CategorySlice<GroupForCategory<C>>;
      case "cache-policy":
        return report.cachePolicy as CategorySlice<GroupForCategory<C>>;
    }
  }
  const f = report.files[fileScope];
  if (!f) return emptyCategorySlice<GroupForCategory<C>>();
  switch (category) {
    case "status":
      return f.status as CategorySlice<GroupForCategory<C>>;
    case "size":
      return f.size as CategorySlice<GroupForCategory<C>>;
    case "encoding":
      return f.encoding as CategorySlice<GroupForCategory<C>>;
    case "cache-policy":
      return f.cachePolicy as CategorySlice<GroupForCategory<C>>;
  }
}

export function reportCategorySlice(
  report: AnomaliesReport,
  category: AnomalyCategory,
): CategorySlice<GroupForCategory<typeof category>> {
  switch (category) {
    case "status":
      return report.status;
    case "size":
      return report.size;
    case "encoding":
      return report.encoding;
    case "cache-policy":
      return report.cachePolicy;
  }
}

export function categoryMeta(category: AnomalyCategory): {
  title: string;
  shortTitle: string;
  description: string;
  href: string;
} {
  switch (category) {
    case "status":
      return {
        title: "Status anomalies",
        shortTitle: "Status",
        description:
          "Same pathname with different HTTP status codes (query ignored).",
        href: "/anomalies/status",
      };
    case "size":
      return {
        title: "Response size drift",
        shortTitle: "Size drift",
        description:
          "Same pathname with large spread in response body size (≥2× or ≥10 KB delta).",
        href: "/anomalies/size",
      };
    case "encoding":
      return {
        title: "Compression & encoding",
        shortTitle: "Encoding",
        description:
          "Different Content-Encoding on the same path, or large compressible responses without encoding.",
        href: "/anomalies/encoding",
      };
    case "cache-policy":
      return {
        title: "Cache-Control & Vary",
        shortTitle: "Cache policy",
        description:
          "Same pathname with inconsistent Cache-Control or Vary response headers.",
        href: "/anomalies/cache-policy",
      };
  }
}
