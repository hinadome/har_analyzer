import type { EntryRecord, HarAnalysis } from "@/types/har";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MimeMismatchKind = "mismatch" | "unverified";

export interface MimeMismatchFinding {
  kind: MimeMismatchKind;
  extension: string;
  contentType: string;
  /** Expected MIME types when kind is mismatch; empty when unverified. */
  expectedTypes: string[];
  message: string;
}

export interface MimeMismatchEntry {
  fileIndex: number;
  entryIndex: number;
  entry: EntryRecord;
  finding: MimeMismatchFinding;
}

export interface MimeMismatchFileReport {
  fileIndex: number;
  fileName: string;
  mismatchCount: number;
  unverifiedCount: number;
  entries: MimeMismatchEntry[];
}

export interface MimeMismatchReport {
  files: MimeMismatchFileReport[];
  mismatchCount: number;
  unverifiedCount: number;
  /** Entries with a pathname extension (known or unknown). */
  withExtensionCount: number;
}

// ---------------------------------------------------------------------------
// Extension → expected MIME (lowercase, no parameters)
// ---------------------------------------------------------------------------

const EXT_TO_MIMES: Record<string, readonly string[]> = {
  html: ["text/html"],
  htm: ["text/html"],
  css: ["text/css"],
  js: ["text/javascript", "application/javascript", "application/x-javascript"],
  mjs: ["text/javascript", "application/javascript"],
  json: ["application/json", "application/ld+json"],
  map: ["application/json"],
  xml: ["application/xml", "text/xml"],
  txt: ["text/plain"],
  csv: ["text/csv", "application/csv"],
  svg: ["image/svg+xml"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  avif: ["image/avif"],
  ico: ["image/x-icon", "image/vnd.microsoft.icon"],
  bmp: ["image/bmp"],
  woff: ["font/woff", "application/font-woff"],
  woff2: ["font/woff2"],
  ttf: ["font/ttf", "application/font-sfnt", "application/x-font-ttf"],
  otf: ["font/otf", "application/font-sfnt", "application/x-font-opentype"],
  wasm: ["application/wasm"],
  pdf: ["application/pdf"],
  zip: ["application/zip", "application/x-zip-compressed"],
  gz: ["application/gzip", "application/x-gzip"],
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  mp3: ["audio/mpeg", "audio/mp3"],
  wav: ["audio/wav", "audio/x-wav"],
  ogg: ["audio/ogg", "application/ogg"],
};

const SKIPPED_CONTENT_TYPES = new Set(["", "unknown"]);

// ---------------------------------------------------------------------------
// URL extension
// ---------------------------------------------------------------------------

/** Last pathname segment extension, lowercase, without leading dot. */
export function urlExtension(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split("/").pop() ?? "";
    const dot = segment.lastIndexOf(".");
    if (dot <= 0 || dot === segment.length - 1) return null;
    const ext = segment.slice(dot + 1).toLowerCase();
    if (!ext || ext.length > 32) return null;
    return ext;
  } catch {
    return null;
  }
}

export function expectedMimesForExtension(ext: string): string[] {
  return [...(EXT_TO_MIMES[ext.toLowerCase()] ?? [])];
}

export function isKnownExtension(ext: string): boolean {
  return expectedMimesForExtension(ext).length > 0;
}

function contentTypeMatchesExpected(
  contentType: string,
  expected: readonly string[],
): boolean {
  if (expected.length === 0) return false;
  const actual = contentType.toLowerCase();
  return expected.some((e) => e === actual);
}

// ---------------------------------------------------------------------------
// Per-entry analysis
// ---------------------------------------------------------------------------

export function analyzeMimeMismatch(entry: EntryRecord): MimeMismatchFinding | null {
  const ext = urlExtension(entry.url);
  if (!ext) return null;

  const contentType = (entry.contentType ?? "").toLowerCase();
  if (SKIPPED_CONTENT_TYPES.has(contentType)) return null;

  const expected = expectedMimesForExtension(ext);

  if (expected.length === 0) {
    return {
      kind: "unverified",
      extension: ext,
      contentType,
      expectedTypes: [],
      message: `Extension .${ext} has no expected MIME mapping in this tool`,
    };
  }

  if (contentTypeMatchesExpected(contentType, expected)) return null;

  const expectedLabel = expected.join(" or ");
  return {
    kind: "mismatch",
    extension: ext,
    contentType,
    expectedTypes: [...expected],
    message: `Content-Type ${contentType} does not match .${ext} (expected ${expectedLabel})`,
  };
}

// ---------------------------------------------------------------------------
// Store aggregation
// ---------------------------------------------------------------------------

export function mimeMismatchEntryId(me: MimeMismatchEntry): string {
  return `${me.fileIndex}:${me.entryIndex}`;
}

export function analyzeStore(analyses: HarAnalysis[]): MimeMismatchReport {
  const files: MimeMismatchFileReport[] = [];
  let mismatchCount = 0;
  let unverifiedCount = 0;
  let withExtensionCount = 0;

  for (const analysis of analyses) {
    const entries: MimeMismatchEntry[] = [];
    let fileMismatch = 0;
    let fileUnverified = 0;

    for (let i = 0; i < analysis.entries.length; i++) {
      const entry = analysis.entries[i];
      const ext = urlExtension(entry.url);
      if (ext) withExtensionCount += 1;

      const finding = analyzeMimeMismatch(entry);
      if (!finding) continue;

      entries.push({
        fileIndex: analysis.fileIndex,
        entryIndex: entry.indexInFile ?? i,
        entry,
        finding,
      });

      if (finding.kind === "mismatch") {
        fileMismatch += 1;
        mismatchCount += 1;
      } else {
        fileUnverified += 1;
        unverifiedCount += 1;
      }
    }

    files.push({
      fileIndex: analysis.fileIndex,
      fileName: analysis.fileName,
      mismatchCount: fileMismatch,
      unverifiedCount: fileUnverified,
      entries,
    });
  }

  return {
    files,
    mismatchCount,
    unverifiedCount,
    withExtensionCount,
  };
}

/** Rows visible with default filters (mismatches only). */
export function visibleMismatchEntries(
  report: MimeMismatchReport,
  showUnverified: boolean,
): MimeMismatchEntry[] {
  const out: MimeMismatchEntry[] = [];
  for (const f of report.files) {
    for (const e of f.entries) {
      if (e.finding.kind === "mismatch") {
        out.push(e);
      } else if (showUnverified && e.finding.kind === "unverified") {
        out.push(e);
      }
    }
  }
  return out;
}
