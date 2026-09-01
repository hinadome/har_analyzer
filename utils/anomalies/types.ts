import type { EntryRecord, HarAnalysis } from "@/types/har";

export type AnomalyCategory = "status" | "size" | "encoding" | "cache-policy";

export const ANOMALY_CATEGORIES: readonly AnomalyCategory[] = [
  "status",
  "size",
  "encoding",
  "cache-policy",
];

export function isAnomalyCategory(value: string): value is AnomalyCategory {
  return (ANOMALY_CATEGORIES as readonly string[]).includes(value);
}

export interface AnomalyEntry {
  fileIndex: number;
  entryIndex: number;
  entry: EntryRecord;
}

export interface StatusAnomalyGroup {
  pathname: string;
  entries: AnomalyEntry[];
  distinctStatuses: number[];
}

export interface SizeAnomalyGroup {
  pathname: string;
  entries: AnomalyEntry[];
  minSize: number;
  maxSize: number;
  ratio: number;
  delta: number;
}

export type EncodingAnomalyKind = "encoding-drift" | "large-uncompressed";

export interface EncodingAnomalyGroup {
  pathname: string;
  entries: AnomalyEntry[];
  kind: EncodingAnomalyKind;
  distinctEncodings: string[];
}

export type CachePolicyKind = "cache-control" | "vary" | "both";

export interface CachePolicyAnomalyGroup {
  pathname: string;
  entries: AnomalyEntry[];
  kind: CachePolicyKind;
  distinctCacheControl: string[];
  distinctVary: string[];
}

export interface CategorySlice<G> {
  groups: G[];
  pathGroupCount: number;
  entryCount: number;
}

export interface AnomaliesFileReport {
  fileIndex: number;
  fileName: string;
  status: CategorySlice<StatusAnomalyGroup>;
  size: CategorySlice<SizeAnomalyGroup>;
  encoding: CategorySlice<EncodingAnomalyGroup>;
  cachePolicy: CategorySlice<CachePolicyAnomalyGroup>;
}

export interface PathCorrelation {
  pathname: string;
  categories: AnomalyCategory[];
}

export interface AnomaliesReport {
  files: AnomaliesFileReport[];
  status: CategorySlice<StatusAnomalyGroup>;
  size: CategorySlice<SizeAnomalyGroup>;
  encoding: CategorySlice<EncodingAnomalyGroup>;
  cachePolicy: CategorySlice<CachePolicyAnomalyGroup>;
  uniquePathCount: number;
  correlations: PathCorrelation[];
}

export type FileScope = number | "all";

export type GroupForCategory<C extends AnomalyCategory> = C extends "status"
  ? StatusAnomalyGroup
  : C extends "size"
    ? SizeAnomalyGroup
    : C extends "encoding"
      ? EncodingAnomalyGroup
      : CachePolicyAnomalyGroup;

export interface AnomalyCategoryQuery {
  file: FileScope;
  expand: string;
}

export function emptyCategorySlice<G>(): CategorySlice<G> {
  return { groups: [], pathGroupCount: 0, entryCount: 0 };
}

export function collectAnomalyEntries(analyses: HarAnalysis[]): AnomalyEntry[] {
  const out: AnomalyEntry[] = [];
  for (const analysis of analyses) {
    for (let i = 0; i < analysis.entries.length; i++) {
      const entry = analysis.entries[i];
      out.push({
        fileIndex: analysis.fileIndex,
        entryIndex: entry.indexInFile ?? i,
        entry,
      });
    }
  }
  return out;
}
