import type { HarHeader } from '@/types/har';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KvDiffKind = 'equal' | 'changed' | 'added' | 'removed';

export interface KvDiffEntry {
  name: string;
  /** Value in the baseline entry (undefined when kind === 'added') */
  baseValue: string | undefined;
  /** Value in the compare entry (undefined when kind === 'removed') */
  compareValue: string | undefined;
  kind: KvDiffKind;
}

export interface HeaderDiffResult {
  requestHeaders: KvDiffEntry[];
  responseHeaders: KvDiffEntry[];
  requestCookies: KvDiffEntry[];
  responseCookies: KvDiffEntry[];
  /** True when all four sections are fully equal */
  identical: boolean;
}

// ---------------------------------------------------------------------------
// Core diff logic
// ---------------------------------------------------------------------------

/**
 * Diff two arrays of key-value pairs.
 *
 * Header names are compared case-insensitively (per HTTP spec).
 * When a name appears multiple times in one side, each occurrence is
 * matched positionally against the same-named occurrences on the other side.
 * Values are compared case-sensitively.
 */
export function diffKvPairs(
  baseline: Array<{ name: string; value: string }>,
  compare: Array<{ name: string; value: string }>
): KvDiffEntry[] {
  const result: KvDiffEntry[] = [];

  // Group by lowercased name, preserving insertion order of first occurrence
  const baseMap = new Map<string, string[]>();
  const cmpMap  = new Map<string, string[]>();

  for (const { name, value } of baseline) {
    const key = name.toLowerCase();
    if (!baseMap.has(key)) baseMap.set(key, []);
    baseMap.get(key)!.push(value);
  }
  for (const { name, value } of compare) {
    const key = name.toLowerCase();
    if (!cmpMap.has(key)) cmpMap.set(key, []);
    cmpMap.get(key)!.push(value);
  }

  // Collect all unique names in order: baseline first, then compare-only
  const seen = new Set<string>();
  const orderedKeys: string[] = [];
  for (const { name } of baseline) {
    const key = name.toLowerCase();
    if (!seen.has(key)) { seen.add(key); orderedKeys.push(key); }
  }
  for (const { name } of compare) {
    const key = name.toLowerCase();
    if (!seen.has(key)) { seen.add(key); orderedKeys.push(key); }
  }

  for (const key of orderedKeys) {
    const baseVals = baseMap.get(key) ?? [];
    const cmpVals  = cmpMap.get(key)  ?? [];
    // Use the display name from whichever side has it (prefer baseline)
    const displayName = baseline.find((h) => h.name.toLowerCase() === key)?.name
      ?? compare.find((h) => h.name.toLowerCase() === key)?.name
      ?? key;

    const maxLen = Math.max(baseVals.length, cmpVals.length);
    for (let i = 0; i < maxLen; i++) {
      const bv = baseVals[i];
      const cv = cmpVals[i];

      if (bv !== undefined && cv !== undefined) {
        result.push({
          name: displayName,
          baseValue: bv,
          compareValue: cv,
          kind: bv === cv ? 'equal' : 'changed',
        });
      } else if (bv !== undefined) {
        result.push({ name: displayName, baseValue: bv, compareValue: undefined, kind: 'removed' });
      } else {
        result.push({ name: displayName, baseValue: undefined, compareValue: cv, kind: 'added' });
      }
    }
  }

  return result;
}

/**
 * Compute the full header/cookie diff between two EntryRecord-like objects.
 */
export function computeHeaderDiff(
  baseline: {
    requestHeaders: HarHeader[];
    responseHeaders: HarHeader[];
    requestCookies: Array<{ name: string; value: string }>;
    responseCookies: Array<{ name: string; value: string }>;
  },
  compare: {
    requestHeaders: HarHeader[];
    responseHeaders: HarHeader[];
    requestCookies: Array<{ name: string; value: string }>;
    responseCookies: Array<{ name: string; value: string }>;
  }
): HeaderDiffResult {
  const requestHeaders  = diffKvPairs(baseline.requestHeaders,  compare.requestHeaders);
  const responseHeaders = diffKvPairs(baseline.responseHeaders, compare.responseHeaders);
  const requestCookies  = diffKvPairs(baseline.requestCookies,  compare.requestCookies);
  const responseCookies = diffKvPairs(baseline.responseCookies, compare.responseCookies);

  const identical =
    requestHeaders.every((e)  => e.kind === 'equal') &&
    responseHeaders.every((e) => e.kind === 'equal') &&
    requestCookies.every((e)  => e.kind === 'equal') &&
    responseCookies.every((e) => e.kind === 'equal');

  return { requestHeaders, responseHeaders, requestCookies, responseCookies, identical };
}
