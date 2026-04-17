import { diffLines, diffWordsWithSpace } from 'diff';
import type { EntryRecord } from '@/types/har';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single span of characters within a line, used for intra-line highlighting */
export interface IntraSpan {
  text: string;
  kind: 'equal' | 'removed' | 'added';
}

/** A single rendered line in the diff output */
export interface DiffLine {
  /** Line number in the source string (1-based), null for placeholder lines */
  lineNumber: number | null;
  /** Raw text of the line (without trailing newline) */
  text: string;
  /** Classification of this line */
  kind: 'equal' | 'removed' | 'added' | 'placeholder';
  /**
   * Intra-line spans — populated only for 'removed' and 'added' lines that
   * are paired with a matching change on the opposite side.
   */
  spans: IntraSpan[];
}

/** Final output of computeDiff */
export interface DiffResult {
  /** Lines for the left (baseline) panel */
  leftLines: DiffLine[];
  /** Lines for the right (compare) panel */
  rightLines: DiffLine[];
  /** Interleaved lines for the unified view */
  unifiedLines: DiffLine[];
  /** True when baseline and compare bodies are byte-for-byte equal */
  identical: boolean;
  /** True when JSON prettification was applied to at least one side */
  prettified: boolean;
}

/**
 * A URL candidate group for the search dropdown.
 * When ignoreQuery is on, basePath is the key and fullUrls lists all
 * distinct full URLs sharing that base path.
 */
export interface UrlGroup {
  /** The base path (origin + pathname, no query/hash) */
  basePath: string;
  /** All distinct full URLs that share this base path */
  fullUrls: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TRUNCATION_LIMIT = 50_000;

const BINARY_MIME_PREFIXES = [
  'image/',
  'audio/',
  'video/',
  'font/',
  'application/octet-stream',
  'application/zip',
  'application/pdf',
];

// ---------------------------------------------------------------------------
// URL utilities
// ---------------------------------------------------------------------------

/**
 * Strip the query string and fragment from a URL, returning only
 * the scheme + host + pathname portion.
 *
 * Falls back to splitting on '?' when the URL is not parseable by the
 * URL constructor (e.g. relative paths or malformed strings).
 */
export function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    // Fallback: strip from '?' or '#' onward
    return url.split('?')[0].split('#')[0];
  }
}

/**
 * Build grouped URL candidates from a flat list of unique URLs.
 *
 * When ignoreQuery is true, groups URLs by their base path so the dropdown
 * can show a tree of base path → full URLs.
 *
 * When ignoreQuery is false, each full URL is its own group with one entry.
 */
export function buildUrlGroups(urls: string[], ignoreQuery: boolean): UrlGroup[] {
  if (!ignoreQuery) {
    return urls.map((u) => ({ basePath: u, fullUrls: [u] }));
  }

  const map = new Map<string, Set<string>>();
  for (const url of urls) {
    const base = stripQuery(url);
    if (!map.has(base)) map.set(base, new Set());
    map.get(base)!.add(url);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([basePath, set]) => ({
      basePath,
      fullUrls: Array.from(set).sort(),
    }));
}

// ---------------------------------------------------------------------------
// Entry utilities
// ---------------------------------------------------------------------------

/** Stable unique identifier for an EntryRecord within a session */
export function entryId(e: EntryRecord): string {
  return `${e.harFileIndex}::${e.startedDateTime}::${e.url}`;
}

/** Returns true when the entry has no diffable text body */
export function isBinaryEntry(entry: EntryRecord): boolean {
  if (entry.responseContent === undefined) return true;
  const ct = entry.contentType ?? '';
  return BINARY_MIME_PREFIXES.some((p) => ct.startsWith(p));
}

// ---------------------------------------------------------------------------
// Body transforms
// ---------------------------------------------------------------------------

/**
 * Attempt to pretty-print a JSON body.
 * Returns the prettified string when the content type indicates JSON and the
 * body parses successfully; otherwise returns the original body unchanged.
 */
export function prettifyIfJson(
  body: string,
  contentType: string
): { text: string; wasPrettified: boolean } {
  const ct = (contentType ?? '').toLowerCase();
  const isJson = ct === 'application/json' || ct.endsWith('+json');
  if (!isJson) return { text: body, wasPrettified: false };
  try {
    const parsed = JSON.parse(body);
    return { text: JSON.stringify(parsed, null, 2), wasPrettified: true };
  } catch {
    return { text: body, wasPrettified: false };
  }
}

/**
 * Slice the body to TRUNCATION_LIMIT characters when showFull is false
 * and the body exceeds the limit.
 */
export function truncateBody(
  body: string,
  showFull: boolean
): { text: string; wasTruncated: boolean; fullLength: number } {
  const fullLength = body.length;
  if (!showFull && fullLength > TRUNCATION_LIMIT) {
    return { text: body.slice(0, TRUNCATION_LIMIT), wasTruncated: true, fullLength };
  }
  return { text: body, wasTruncated: false, fullLength };
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

/**
 * Split a diff change value into individual line strings.
 * Drops the trailing empty string produced by a trailing newline.
 */
function splitLines(value: string): string[] {
  const parts = value.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop();
  }
  return parts;
}

function makeLine(
  lineNumber: number | null,
  text: string,
  kind: DiffLine['kind']
): DiffLine {
  return { lineNumber, text, kind, spans: [] };
}

/**
 * Pure function: given two body strings (already prettified/truncated),
 * compute the full DiffResult for rendering.
 */
export function computeDiff(
  baseline: string,
  compare: string,
  prettified = false
): DiffResult {
  try {
    const identical = baseline === compare;
    const changes = diffLines(baseline, compare);

    const leftLines: DiffLine[] = [];
    const rightLines: DiffLine[] = [];
    const unifiedLines: DiffLine[] = [];

    let leftLineNum = 1;
    let rightLineNum = 1;

    // We need to pair removed/added chunks for intra-line diffing.
    // Process changes in pairs when a removed chunk is immediately followed by an added chunk.
    let i = 0;
    while (i < changes.length) {
      const c = changes[i];

      if (c.removed && i + 1 < changes.length && changes[i + 1].added) {
        // Paired remove + add — do intra-line diff
        const removedLines = splitLines(c.value);
        const addedLines = splitLines(changes[i + 1].value);
        const pairLen = Math.max(removedLines.length, addedLines.length);

        for (let j = 0; j < pairLen; j++) {
          const remText = j < removedLines.length ? removedLines[j] : null;
          const addText = j < addedLines.length ? addedLines[j] : null;

          if (remText !== null && addText !== null) {
            // Both sides have a line — compute intra-line spans
            const leftLine = makeLine(leftLineNum++, remText, 'removed');
            const rightLine = makeLine(rightLineNum++, addText, 'added');

            const wordDiff = diffWordsWithSpace(remText, addText);
            leftLine.spans = wordDiff
              .filter((s) => !s.added)
              .map((s) => ({
                text: s.value,
                kind: s.removed ? 'removed' : 'equal',
              } as IntraSpan));
            rightLine.spans = wordDiff
              .filter((s) => !s.removed)
              .map((s) => ({
                text: s.value,
                kind: s.added ? 'added' : 'equal',
              } as IntraSpan));

            leftLines.push(leftLine);
            rightLines.push(rightLine);
            unifiedLines.push(leftLine);
            unifiedLines.push(rightLine);
          } else if (remText !== null) {
            // Extra removed line — no pair
            const leftLine = makeLine(leftLineNum++, remText, 'removed');
            leftLines.push(leftLine);
            rightLines.push(makeLine(null, '', 'placeholder'));
            unifiedLines.push(leftLine);
          } else if (addText !== null) {
            // Extra added line — no pair
            const rightLine = makeLine(rightLineNum++, addText, 'added');
            rightLines.push(rightLine);
            leftLines.push(makeLine(null, '', 'placeholder'));
            unifiedLines.push(rightLine);
          }
        }
        i += 2;
      } else if (c.removed) {
        // Removed with no following add
        for (const text of splitLines(c.value)) {
          const line = makeLine(leftLineNum++, text, 'removed');
          leftLines.push(line);
          rightLines.push(makeLine(null, '', 'placeholder'));
          unifiedLines.push(line);
        }
        i++;
      } else if (c.added) {
        // Added with no preceding remove
        for (const text of splitLines(c.value)) {
          const line = makeLine(rightLineNum++, text, 'added');
          rightLines.push(line);
          leftLines.push(makeLine(null, '', 'placeholder'));
          unifiedLines.push(line);
        }
        i++;
      } else {
        // Equal
        for (const text of splitLines(c.value)) {
          const leftLine = makeLine(leftLineNum++, text, 'equal');
          const rightLine = makeLine(rightLineNum++, text, 'equal');
          leftLines.push(leftLine);
          rightLines.push(rightLine);
          unifiedLines.push(leftLine);
        }
        i++;
      }
    }

    return { leftLines, rightLines, unifiedLines, identical, prettified };
  } catch {
    // Fallback — return empty result so caller can show error
    return {
      leftLines: [],
      rightLines: [],
      unifiedLines: [],
      identical: false,
      prettified,
    };
  }
}
