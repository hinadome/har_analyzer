import type { EntryRecord, HarHeader } from "@/types/har";
import { findHeader } from "@/utils/entryStats";

/** Normalized MIME values that carry no usable type from HAR content.mimeType. */
export const JUNK_HAR_MIME_TYPES = new Set(["", "unknown", "x-unknown"]);

/** Strip parameters (e.g. charset) and lowercase. Empty → `unknown`. */
export function normalizeContentType(mimeType: string): string {
  if (!mimeType) return "unknown";
  return mimeType.split(";")[0].trim().toLowerCase();
}

export interface ResolvedContentType {
  /** From `response.content.mimeType` (normalized). */
  contentMimeType: string;
  /** From `Content-Type` response header (normalized). */
  headerContentType: string;
  /** Effective type used for counts, filters, and MIME checks. */
  contentType: string;
  /** True when effective type came from header because HAR content MIME was junk. */
  contentTypeFromHeader: boolean;
  /** False when both sides have a real type and they differ. */
  contentTypeSourcesAgree: boolean;
}

export function resolveContentType(
  harContentMime: string,
  responseHeaders: HarHeader[],
): ResolvedContentType {
  const contentMimeType = normalizeContentType(harContentMime);
  const headerRaw = findHeader(responseHeaders, "content-type");
  const headerContentType = headerRaw
    ? normalizeContentType(headerRaw)
    : "";

  const harJunk = JUNK_HAR_MIME_TYPES.has(contentMimeType);
  const headerJunk =
    !headerContentType || JUNK_HAR_MIME_TYPES.has(headerContentType);

  const contentTypeFromHeader = harJunk && !headerJunk;
  const contentType = contentTypeFromHeader
    ? headerContentType
    : contentMimeType;

  const harMeaningful = !harJunk;
  const headerMeaningful = !headerJunk;

  let contentTypeSourcesAgree: boolean;
  if (!headerMeaningful) {
    contentTypeSourcesAgree = true;
  } else if (harJunk) {
    contentTypeSourcesAgree = false;
  } else {
    contentTypeSourcesAgree = contentMimeType === headerContentType;
  }

  return {
    contentMimeType,
    headerContentType,
    contentType,
    contentTypeFromHeader,
    contentTypeSourcesAgree,
  };
}

/** Raw `Content-Type` header value for display (may include charset). */
export function rawHeaderContentType(responseHeaders: HarHeader[]): string | null {
  return findHeader(responseHeaders, "content-type");
}

/** Re-resolve content type fields from stored HAR mime + response headers. */
export function enrichEntryContentType(entry: EntryRecord): EntryRecord {
  const harMime =
    entry.contentMimeType ??
    entry.contentType;
  const resolved = resolveContentType(harMime, entry.responseHeaders);
  return {
    ...entry,
    contentMimeType: resolved.contentMimeType,
    headerContentType: resolved.headerContentType,
    contentType: resolved.contentType,
    contentTypeFromHeader: resolved.contentTypeFromHeader,
    contentTypeSourcesAgree: resolved.contentTypeSourcesAgree,
  };
}

export function rebuildContentTypeCounts(
  entries: EntryRecord[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.contentType] = (counts[e.contentType] ?? 0) + 1;
  }
  return counts;
}
