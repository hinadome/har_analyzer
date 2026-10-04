import type { EntryRecord } from "@/types/har";
import {
  compileMatcher,
  type KvSearchMode,
  type MatchRange,
} from "@/utils/kvSearch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { KvSearchMode as ContentSearchMode } from "@/utils/kvSearch";

/** An entry paired with its resolved response body text (if any). */
export interface EntryBody {
  entry: EntryRecord;
  /**
   * Resolved response body. `undefined` = not loaded / no body captured;
   * callers that pass bodies they loaded on demand should pass the text here.
   */
  body: string | undefined;
}

export interface ContentSearchQuery {
  /** Needle to search for inside the response body. Empty = no search. */
  text: string;
  mode: KvSearchMode;
  caseSensitive: boolean;
  /**
   * Optional entry-level pre-filter. Substring match against `entry.url`,
   * always case-insensitive. Empty = no URL filter.
   */
  url?: string;
}

/** A single match inside a body with a surrounding snippet for display. */
export interface ContentSnippet {
  /** Snippet text (a window around the match). */
  text: string;
  /** Ranges within `text` (not the full body) that should be highlighted. */
  ranges: MatchRange[];
  /** Absolute character offset in the body where this snippet begins. */
  offset: number;
}

export interface ContentSearchHit {
  entry: EntryRecord;
  /** Total number of matches found in this entry's body. */
  matchCount: number;
  /** Snippets around (capped) matches for display. */
  snippets: ContentSnippet[];
  /** Length of the searched body in characters. */
  bodyLength: number;
}

export interface ContentSearchSummary {
  /** Entries whose body contained at least one match. */
  totalHits: number;
  /** Sum of match counts across all hits. */
  totalMatches: number;
  /** Distinct `harFileIndex` values across all hits. */
  filesTouched: number;
  /** Entries that were in scope but had no loaded/captured body. */
  entriesWithoutBody: number;
  /** Entries actually searched (had a body and passed the URL pre-filter). */
  entriesSearched: number;
}

export interface ContentSearchError {
  message: string;
}

export interface ContentSearchOutcome {
  hits: ContentSearchHit[];
  summary: ContentSearchSummary;
  /** Present when the pattern was an invalid regex or timed out. */
  errors: ContentSearchError[];
}

// ---------------------------------------------------------------------------
// Snippet extraction
// ---------------------------------------------------------------------------

/** Characters of context to show on each side of a match. */
export const SNIPPET_CONTEXT = 60;
/** Maximum number of snippets rendered per entry (keeps the UI bounded). */
export const MAX_SNIPPETS_PER_ENTRY = 20;

/**
 * Build display snippets from the full set of match ranges in a body.
 *
 * Adjacent/overlapping windows are merged so a dense cluster of matches
 * produces one readable snippet rather than many overlapping ones. Each
 * snippet carries ranges rebased to the snippet's own coordinate space.
 */
export function buildSnippets(
  body: string,
  ranges: MatchRange[],
  context = SNIPPET_CONTEXT,
  maxSnippets = MAX_SNIPPETS_PER_ENTRY,
): ContentSnippet[] {
  if (ranges.length === 0) return [];

  // Merge match windows that overlap or touch.
  type Window = { start: number; end: number; ranges: MatchRange[] };
  const windows: Window[] = [];
  for (const r of ranges) {
    const winStart = Math.max(0, r.start - context);
    const winEnd = Math.min(body.length, r.end + context);
    const last = windows[windows.length - 1];
    if (last && winStart <= last.end) {
      last.end = Math.max(last.end, winEnd);
      last.ranges.push(r);
    } else {
      windows.push({ start: winStart, end: winEnd, ranges: [r] });
    }
    if (windows.length > maxSnippets) break;
  }

  const limited = windows.slice(0, maxSnippets);
  return limited.map((w) => ({
    text: body.slice(w.start, w.end),
    offset: w.start,
    ranges: w.ranges.map((r) => ({
      start: r.start - w.start,
      end: r.end - w.start,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function emptySummary(): ContentSearchSummary {
  return {
    totalHits: 0,
    totalMatches: 0,
    filesTouched: 0,
    entriesWithoutBody: 0,
    entriesSearched: 0,
  };
}

/**
 * Search response bodies for a text/regex needle.
 *
 * Semantics:
 * - Empty needle returns no hits (searching for "nothing" returns nothing).
 * - Invalid regex: reported via `outcome.errors`; the result is empty.
 * - A regex that exceeds the per-body CPU budget aborts with a timeout error
 *   (reusing the budgeted executor from `kvSearch`).
 * - Entries without a loaded body are skipped but counted in
 *   `summary.entriesWithoutBody` so the UI can prompt to load them.
 */
export function searchContent(
  records: EntryBody[],
  query: ContentSearchQuery,
): ContentSearchOutcome {
  const matcher = compileMatcher(query.text, query.mode, query.caseSensitive);

  const errors: ContentSearchError[] = [];
  if (matcher.kind === "error") {
    errors.push({ message: matcher.message });
  }

  // No needle (any) or an invalid regex → empty result.
  if (matcher.kind !== "match") {
    return { hits: [], summary: emptySummary(), errors };
  }

  const urlNeedle = (query.url ?? "").toLowerCase();

  const hits: ContentSearchHit[] = [];
  const files = new Set<number>();
  let totalMatches = 0;
  let entriesWithoutBody = 0;
  let entriesSearched = 0;

  for (const { entry, body } of records) {
    if (urlNeedle !== "" && !entry.url.toLowerCase().includes(urlNeedle)) {
      continue;
    }
    if (body === undefined || body === "") {
      if (body === undefined) entriesWithoutBody += 1;
      continue;
    }

    entriesSearched += 1;
    const result = matcher.run(body);
    if (result === "timeout") {
      errors.push({
        message: "Pattern timed out — simplify the regex or narrow scope",
      });
      // Abort the whole run: a runaway pattern would stall every body.
      return { hits: [], summary: emptySummary(), errors };
    }
    if (result === null) continue;

    const snippets = buildSnippets(body, result);
    hits.push({
      entry,
      matchCount: result.length,
      snippets,
      bodyLength: body.length,
    });
    totalMatches += result.length;
    files.add(entry.harFileIndex);
  }

  return {
    hits,
    summary: {
      totalHits: hits.length,
      totalMatches,
      filesTouched: files.size,
      entriesWithoutBody,
      entriesSearched,
    },
    errors,
  };
}

// ---------------------------------------------------------------------------
// URL state helpers
// ---------------------------------------------------------------------------

/** Stable identifier for deep-linking expanded rows (`?expand=`). */
export function contentEntryId(
  entry: EntryRecord,
  indexInFile: number,
): string {
  return `${entry.harFileIndex}:${indexInFile}`;
}
