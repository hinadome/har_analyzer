import type { EntryRecord, HarAnalysis } from "@/types/har";
import { pathKey } from "@/utils/contentDiff";
import { findHeader } from "@/utils/entryStats";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CacheValidatorDriftKind = "etag" | "last-modified" | "both";

export interface ParsedEtag {
  /** Raw header value. */
  raw: string;
  weak: boolean;
  /** Unquoted entity tag body. */
  value: string;
  /** Drift comparison key — weak vs strong with same value are distinct. */
  key: string;
}

export interface ParsedLastModified {
  raw: string;
  /** Milliseconds when parseable; otherwise normalized string. */
  key: string;
}

export interface CacheValidatorEntry {
  fileIndex: number;
  entryIndex: number;
  entry: EntryRecord;
  etag: ParsedEtag | null;
  lastModified: ParsedLastModified | null;
}

export interface CacheValidatorPathGroup {
  pathname: string;
  entries: CacheValidatorEntry[];
  distinctEtags: ParsedEtag[];
  distinctLastModified: ParsedLastModified[];
  kind: CacheValidatorDriftKind;
}

export interface CacheValidatorFileReport {
  fileIndex: number;
  fileName: string;
  pathConflictCount: number;
  entryCount: number;
  /** Paths with ≥2 entries but no ETag or Last-Modified on any entry. */
  noValidatorPathCount: number;
  groups: CacheValidatorPathGroup[];
  noValidatorGroups: CacheValidatorPlainPathGroup[];
}

export interface CacheValidatorPlainPathGroup {
  pathname: string;
  entries: CacheValidatorEntry[];
}

export interface CacheValidatorReport {
  files: CacheValidatorFileReport[];
  groups: CacheValidatorPathGroup[];
  noValidatorGroups: CacheValidatorPlainPathGroup[];
  pathConflictCount: number;
  entryCount: number;
  noValidatorPathCount: number;
}

// ---------------------------------------------------------------------------
// ETag / Last-Modified parsing
// ---------------------------------------------------------------------------

/** Parse an ETag response header value (weak tags kept distinct from strong). */
export function parseEtag(raw: string | null | undefined): ParsedEtag | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let rest = trimmed;
  let weak = false;
  if (rest.startsWith("W/")) {
    weak = true;
    rest = rest.slice(2).trim();
  }

  let value = rest;
  if (rest.length >= 2 && rest.startsWith('"') && rest.endsWith('"')) {
    value = rest.slice(1, -1);
  }

  if (!value) return null;

  const key = weak ? `W:${value}` : `S:${value}`;
  return { raw: trimmed, weak, value, key };
}

export function parseLastModified(
  raw: string | null | undefined,
): ParsedLastModified | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  const key = Number.isNaN(ms) ? trimmed.toLowerCase() : String(ms);
  return { raw: trimmed, key };
}

export function etagFromEntry(entry: EntryRecord): ParsedEtag | null {
  return parseEtag(findHeader(entry.responseHeaders, "etag"));
}

export function lastModifiedFromEntry(entry: EntryRecord): ParsedLastModified | null {
  return parseLastModified(findHeader(entry.responseHeaders, "last-modified"));
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function uniqueEtags(entries: CacheValidatorEntry[]): ParsedEtag[] {
  const seen = new Map<string, ParsedEtag>();
  for (const e of entries) {
    if (e.etag) seen.set(e.etag.key, e.etag);
  }
  return [...seen.values()];
}

function uniqueLastModified(entries: CacheValidatorEntry[]): ParsedLastModified[] {
  const seen = new Map<string, ParsedLastModified>();
  for (const e of entries) {
    if (e.lastModified) seen.set(e.lastModified.key, e.lastModified);
  }
  return [...seen.values()];
}

function driftKind(
  etagCount: number,
  lmCount: number,
): CacheValidatorDriftKind | null {
  const etagDrift = etagCount > 1;
  const lmDrift = lmCount > 1;
  if (!etagDrift && !lmDrift) return null;
  if (etagDrift && lmDrift) return "both";
  if (etagDrift) return "etag";
  return "last-modified";
}

function buildPathGroups(entries: CacheValidatorEntry[]): {
  groups: CacheValidatorPathGroup[];
  noValidatorGroups: CacheValidatorPlainPathGroup[];
  noValidatorPathCount: number;
} {
  const byPath = new Map<string, CacheValidatorEntry[]>();
  for (const e of entries) {
    const pathname = pathKey(e.entry.url);
    const list = byPath.get(pathname) ?? [];
    list.push(e);
    byPath.set(pathname, list);
  }

  const groups: CacheValidatorPathGroup[] = [];
  const noValidatorGroups: CacheValidatorPlainPathGroup[] = [];

  for (const [pathname, pathEntries] of byPath) {
    if (pathEntries.length < 2) continue;

    const distinctEtags = uniqueEtags(pathEntries);
    const distinctLastModified = uniqueLastModified(pathEntries);
    const kind = driftKind(distinctEtags.length, distinctLastModified.length);

    if (!kind) {
      const anyValidator = pathEntries.some((e) => e.etag || e.lastModified);
      if (!anyValidator) {
        noValidatorGroups.push({ pathname, entries: pathEntries });
      }
      continue;
    }

    groups.push({
      pathname,
      entries: pathEntries,
      distinctEtags,
      distinctLastModified,
      kind,
    });
  }

  groups.sort((a, b) => {
    if (b.entries.length !== a.entries.length) {
      return b.entries.length - a.entries.length;
    }
    return a.pathname.localeCompare(b.pathname);
  });

  noValidatorGroups.sort((a, b) => {
    if (b.entries.length !== a.entries.length) {
      return b.entries.length - a.entries.length;
    }
    return a.pathname.localeCompare(b.pathname);
  });

  return {
    groups,
    noValidatorGroups,
    noValidatorPathCount: noValidatorGroups.length,
  };
}

function entryFromAnalysis(
  analysis: HarAnalysis,
  entry: EntryRecord,
  entryIndex: number,
): CacheValidatorEntry {
  return {
    fileIndex: analysis.fileIndex,
    entryIndex: entry.indexInFile ?? entryIndex,
    entry,
    etag: etagFromEntry(entry),
    lastModified: lastModifiedFromEntry(entry),
  };
}

function sumEntryCount(groups: CacheValidatorPathGroup[]): number {
  return groups.reduce((n, g) => n + g.entries.length, 0);
}

// ---------------------------------------------------------------------------
// Store aggregation
// ---------------------------------------------------------------------------

export function cacheValidatorPathId(pathname: string): string {
  return pathname;
}

export function analyzeStore(analyses: HarAnalysis[]): CacheValidatorReport {
  const files: CacheValidatorFileReport[] = [];

  for (const analysis of analyses) {
    const entries: CacheValidatorEntry[] = analysis.entries.map((entry, i) =>
      entryFromAnalysis(analysis, entry, i),
    );
    const { groups, noValidatorGroups, noValidatorPathCount } = buildPathGroups(entries);
    files.push({
      fileIndex: analysis.fileIndex,
      fileName: analysis.fileName,
      pathConflictCount: groups.length,
      entryCount: sumEntryCount(groups),
      noValidatorPathCount,
      groups,
      noValidatorGroups,
    });
  }

  const allEntries: CacheValidatorEntry[] = [];
  for (const analysis of analyses) {
    for (let i = 0; i < analysis.entries.length; i++) {
      allEntries.push(entryFromAnalysis(analysis, analysis.entries[i], i));
    }
  }
  const { groups, noValidatorGroups, noValidatorPathCount } = buildPathGroups(allEntries);

  return {
    files,
    groups,
    noValidatorGroups,
    pathConflictCount: groups.length,
    entryCount: sumEntryCount(groups),
    noValidatorPathCount,
  };
}

export function scopedPathGroups(
  report: CacheValidatorReport,
  fileScope: number | "all",
): CacheValidatorPathGroup[] {
  if (fileScope === "all") return report.groups;
  const f = report.files[fileScope];
  return f?.groups ?? [];
}

/** Path groups with ≥2 entries but no validators on any entry. */
export function scopedNoValidatorGroups(
  report: CacheValidatorReport,
  fileScope: number | "all",
): CacheValidatorPlainPathGroup[] {
  if (fileScope === "all") return report.noValidatorGroups;
  return report.files[fileScope]?.noValidatorGroups ?? [];
}
