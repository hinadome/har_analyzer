/**
 * Cheap home-page insight aggregates — only uses HarAnalysis rollups
 * (statusCodeCounts, totalRequests, totalContentSize) and an optional CORS
 * report. Never walks entry arrays or runs computePerfStats.
 */

import type { HarAnalysis } from "@/types/har";
import type { CorsReport } from "@/utils/corsAnalysis";
import { isErrorStatus } from "@/utils/perfStats";

export interface FileInsight {
  fileIndex: number;
  fileName: string;
  totalRequests: number;
  totalContentSize: number;
  errorCount: number;
  uniqueUrlCount: number;
}

export interface PairDelta {
  baseIndex: number;
  cmpIndex: number;
  baseName: string;
  cmpName: string;
  deltaRequests: number;
  deltaErrors: number;
  deltaBytes: number;
}

export interface HomeInsights {
  files: FileInsight[];
  totalRequests: number;
  totalContentSize: number;
  totalErrors: number;
  /** First two files when ≥2 loaded — for headline pair deltas. */
  pair: PairDelta | null;
  cors: {
    crossOriginCount: number;
    errorCount: number;
    warningCount: number;
  } | null;
  mimeMismatch: {
    mismatchCount: number;
    unverifiedCount: number;
  } | null;
  cacheValidator: {
    pathConflictCount: number;
    entryCount: number;
  } | null;
}

/** Home / tools copy for the CORS insight chip. */
export type CorsInsightTone = "error" | "warning" | "clear";

export function corsInsightTone(cors: {
  errorCount: number;
  warningCount: number;
}): CorsInsightTone {
  if (cors.errorCount > 0) return "error";
  if (cors.warningCount > 0) return "warning";
  return "clear";
}

export function corsInsightTitle(cors: {
  crossOriginCount: number;
  errorCount: number;
  warningCount: number;
}): string {
  const tone = corsInsightTone(cors);
  if (tone === "error") {
    return `CORS audit — ${cors.errorCount} error${cors.errorCount === 1 ? "" : "s"}`;
  }
  if (tone === "warning") {
    return `CORS — ${cors.warningCount} warning${cors.warningCount === 1 ? "" : "s"}`;
  }
  const n = cors.crossOriginCount.toLocaleString();
  return `${n} cross-origin request${cors.crossOriginCount === 1 ? "" : "s"} — all clear`;
}

export function corsInsightSubtitle(cors: {
  crossOriginCount: number;
  errorCount: number;
  warningCount: number;
}): string {
  const tone = corsInsightTone(cors);
  if (tone === "clear") {
    return "Browse origins, preflights, and ACA-* headers";
  }
  return `${cors.crossOriginCount.toLocaleString()} cross-origin request${
    cors.crossOriginCount === 1 ? "" : "s"
  } captured`;
}

export function errorCountFromStatusMap(
  statusCodeCounts: Record<number, number> | undefined,
): number {
  if (!statusCodeCounts) return 0;
  let n = 0;
  for (const [code, count] of Object.entries(statusCodeCounts)) {
    if (isErrorStatus(Number(code))) n += count;
  }
  return n;
}

export function fileInsight(a: HarAnalysis): FileInsight {
  return {
    fileIndex: a.fileIndex,
    fileName: a.fileName,
    totalRequests: a.totalRequests,
    totalContentSize: a.totalContentSize,
    errorCount: errorCountFromStatusMap(a.statusCodeCounts),
    uniqueUrlCount: a.uniqueUrlCount,
  };
}

export function computeHomeInsights(
  analyses: HarAnalysis[],
  corsReport: CorsReport | null,
  mimeReport: { mismatchCount: number; unverifiedCount: number } | null = null,
  cacheReport: { pathConflictCount: number; entryCount: number } | null = null,
): HomeInsights {
  const files = analyses.map(fileInsight);
  const totalRequests = files.reduce((s, f) => s + f.totalRequests, 0);
  const totalContentSize = files.reduce((s, f) => s + f.totalContentSize, 0);
  const totalErrors = files.reduce((s, f) => s + f.errorCount, 0);

  let pair: PairDelta | null = null;
  if (files.length >= 2) {
    const base = files[0];
    const cmp = files[1];
    pair = {
      baseIndex: base.fileIndex,
      cmpIndex: cmp.fileIndex,
      baseName: base.fileName,
      cmpName: cmp.fileName,
      deltaRequests: cmp.totalRequests - base.totalRequests,
      deltaErrors: cmp.errorCount - base.errorCount,
      deltaBytes: cmp.totalContentSize - base.totalContentSize,
    };
  }

  const cors =
    corsReport && corsReport.crossOriginCount > 0
      ? {
          crossOriginCount: corsReport.crossOriginCount,
          errorCount: corsReport.errorCount,
          warningCount: corsReport.warningCount,
        }
      : null;

  const mimeMismatch =
    mimeReport && analyses.length > 0
      ? {
          mismatchCount: mimeReport.mismatchCount,
          unverifiedCount: mimeReport.unverifiedCount,
        }
      : null;

  const cacheValidator =
    cacheReport && analyses.length > 0
      ? {
          pathConflictCount: cacheReport.pathConflictCount,
          entryCount: cacheReport.entryCount,
        }
      : null;

  return {
    files,
    totalRequests,
    totalContentSize,
    totalErrors,
    pair,
    cors,
    mimeMismatch,
    cacheValidator,
  };
}
