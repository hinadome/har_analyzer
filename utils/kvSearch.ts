import type { EntryRecord } from "@/types/har";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KvLocation =
  | "request-header"
  | "response-header"
  | "request-cookie"
  | "response-cookie";

export const KV_LOCATIONS: readonly KvLocation[] = [
  "request-header",
  "response-header",
  "request-cookie",
  "response-cookie",
] as const;

export type KvSearchMode = "contains" | "exact" | "regex";

export interface KvSearchQuery {
  /** Empty string is treated as a wildcard for the name side. */
  name: string;
  /** Empty string is treated as a wildcard for the value side. */
  value: string;
  /** Set of locations to include. When empty, the search returns no hits. */
  scope: Set<KvLocation>;
  mode: KvSearchMode;
  caseSensitive: boolean;
  /**
   * Optional entry-level pre-filter. Substring match against `entry.url`,
   * always case-insensitive — independent from `mode` / `caseSensitive`
   * which only govern the name / value kv matchers. Empty = no URL filter.
   */
  url?: string;
}

/** Half-open `[start, end)` range into the matched haystack string. */
export interface MatchRange {
  start: number;
  end: number;
}

export interface KvMatch {
  location: KvLocation;
  name: string;
  value: string;
  /** Empty when the name side was wildcarded. */
  nameRanges: MatchRange[];
  /** Empty when the value side was wildcarded. */
  valueRanges: MatchRange[];
}

export interface KvSearchHit {
  entry: EntryRecord;
  matches: KvMatch[];
}

export interface KvSearchSummary {
  /** Number of entries that contributed at least one match. */
  totalHits: number;
  /** Sum of `hit.matches.length` over every hit. */
  totalMatches: number;
  /** Per-location counts of kv pairs that matched. */
  perLocation: Record<KvLocation, number>;
  /** Number of distinct `harFileIndex` values across all hits. */
  filesTouched: number;
}

export interface KvSearchError {
  /** Which side of the query failed to compile. */
  side: "name" | "value";
  message: string;
}

export interface KvSearchOutcome {
  hits: KvSearchHit[];
  summary: KvSearchSummary;
  /** Present when one or both sides had an invalid regex pattern. */
  errors: KvSearchError[];
}

// ---------------------------------------------------------------------------
// Matcher compilation
// ---------------------------------------------------------------------------

type Matcher =
  | { kind: "any" }
  | { kind: "match"; run: (hay: string) => MatchRange[] | null }
  | { kind: "error"; message: string };

/**
 * Compile a needle into a matcher that returns the list of matching ranges in
 * a haystack, or `null` when there is no match.
 *
 * - Empty needle returns `{ kind: "any" }` — treated as a wildcard by the
 *   caller; it does not contribute to `nameRanges` / `valueRanges` so the
 *   highlight stays empty.
 * - Invalid regex returns `{ kind: "error", message }`; the caller surfaces it
 *   via `KvSearchOutcome.errors` and treats the side as "no match" so the
 *   results table stays empty (instead of showing every entry).
 */
export function compileMatcher(
  needle: string,
  mode: KvSearchMode,
  caseSensitive: boolean,
): Matcher {
  if (!needle) return { kind: "any" };

  if (mode === "exact") {
    const target = caseSensitive ? needle : needle.toLowerCase();
    return {
      kind: "match",
      run: (hay) => {
        const subject = caseSensitive ? hay : hay.toLowerCase();
        return subject === target ? [{ start: 0, end: hay.length }] : null;
      },
    };
  }

  if (mode === "contains") {
    const target = caseSensitive ? needle : needle.toLowerCase();
    return {
      kind: "match",
      run: (hay) => {
        const subject = caseSensitive ? hay : hay.toLowerCase();
        const ranges: MatchRange[] = [];
        let from = 0;
        while (from <= subject.length) {
          const i = subject.indexOf(target, from);
          if (i < 0) break;
          ranges.push({ start: i, end: i + target.length });
          from = i + Math.max(target.length, 1);
        }
        return ranges.length > 0 ? ranges : null;
      },
    };
  }

  // mode === "regex"
  let re: RegExp;
  try {
    re = new RegExp(needle, caseSensitive ? "g" : "gi");
  } catch (err) {
    return {
      kind: "error",
      message:
        err instanceof Error ? err.message : "Invalid regular expression",
    };
  }
  return {
    kind: "match",
    run: (hay) => {
      const ranges: MatchRange[] = [];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(hay)) !== null) {
        // Guard against zero-width matches that would otherwise loop forever.
        if (m.index === re.lastIndex) re.lastIndex += 1;
        ranges.push({ start: m.index, end: m.index + m[0].length });
      }
      return ranges.length > 0 ? ranges : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Entry search
// ---------------------------------------------------------------------------

function collectKvPairs(
  entry: EntryRecord,
  location: KvLocation,
): Array<{ name: string; value: string }> {
  switch (location) {
    case "request-header":
      return entry.requestHeaders;
    case "response-header":
      return entry.responseHeaders;
    case "request-cookie":
      return entry.requestCookies;
    case "response-cookie":
      return entry.responseCookies;
  }
}

function emptyPerLocation(): Record<KvLocation, number> {
  return {
    "request-header": 0,
    "response-header": 0,
    "request-cookie": 0,
    "response-cookie": 0,
  };
}

/**
 * Run a kv search against a list of entries.
 *
 * Semantics (locked decisions):
 * - When both `name` and `value` are supplied, they must match the SAME kv
 *   pair (AND-within-pair).
 * - An empty needle on either side is a wildcard for that side; the matching
 *   pair still appears in `matches`, but with empty ranges on that side.
 * - When the query yields no matchers (both inputs empty, or both compiled to
 *   `any`), the result is empty — searching for "nothing" returns nothing.
 * - Invalid regex on either side: that side becomes a "no match" — the
 *   result is empty and the error is reported via `outcome.errors`.
 */
export function searchEntries(
  entries: EntryRecord[],
  query: KvSearchQuery,
): KvSearchOutcome {
  const nameMatcher = compileMatcher(
    query.name,
    query.mode,
    query.caseSensitive,
  );
  const valueMatcher = compileMatcher(
    query.value,
    query.mode,
    query.caseSensitive,
  );

  const errors: KvSearchError[] = [];
  if (nameMatcher.kind === "error") {
    errors.push({ side: "name", message: nameMatcher.message });
  }
  if (valueMatcher.kind === "error") {
    errors.push({ side: "value", message: valueMatcher.message });
  }

  // Searching with nothing on either side returns nothing.
  const hasFilter = nameMatcher.kind !== "any" || valueMatcher.kind !== "any";
  const empty: KvSearchOutcome = {
    hits: [],
    summary: {
      totalHits: 0,
      totalMatches: 0,
      perLocation: emptyPerLocation(),
      filesTouched: 0,
    },
    errors,
  };
  if (!hasFilter || errors.length > 0 || query.scope.size === 0) {
    return empty;
  }

  const hits: KvSearchHit[] = [];
  const perLocation = emptyPerLocation();
  const files = new Set<number>();
  let totalMatches = 0;

  // URL pre-filter — always contains, case-insensitive. Skip the work below
  // when the entry's URL doesn't contain the needle.
  const urlNeedle = (query.url ?? "").toLowerCase();

  for (const entry of entries) {
    if (urlNeedle !== "" && !entry.url.toLowerCase().includes(urlNeedle)) {
      continue;
    }
    const matches: KvMatch[] = [];
    for (const location of KV_LOCATIONS) {
      if (!query.scope.has(location)) continue;
      const pairs = collectKvPairs(entry, location);
      for (const pair of pairs) {
        const nameRanges =
          nameMatcher.kind === "any"
            ? []
            : nameMatcher.kind === "match"
              ? (nameMatcher.run(pair.name) ?? null)
              : null;
        if (nameMatcher.kind === "match" && nameRanges === null) continue;

        const valueRanges =
          valueMatcher.kind === "any"
            ? []
            : valueMatcher.kind === "match"
              ? (valueMatcher.run(pair.value) ?? null)
              : null;
        if (valueMatcher.kind === "match" && valueRanges === null) continue;

        matches.push({
          location,
          name: pair.name,
          value: pair.value,
          nameRanges: nameRanges ?? [],
          valueRanges: valueRanges ?? [],
        });
        perLocation[location] += 1;
        totalMatches += 1;
      }
    }
    if (matches.length > 0) {
      hits.push({ entry, matches });
      files.add(entry.harFileIndex);
    }
  }

  return {
    hits,
    summary: {
      totalHits: hits.length,
      totalMatches,
      perLocation,
      filesTouched: files.size,
    },
    errors,
  };
}

// ---------------------------------------------------------------------------
// URL state helpers
// ---------------------------------------------------------------------------

/** Stable identifier for deep-linking expanded rows (`?expand=`). */
export function kvEntryId(entry: EntryRecord, indexInFile: number): string {
  return `${entry.harFileIndex}:${indexInFile}`;
}

/** Compact ↔ Set conversion for the `?scope=` parameter (e.g. "rh,rc"). */
export const SCOPE_PARAM: Record<KvLocation, string> = {
  "request-header": "rh",
  "response-header": "sh",
  "request-cookie": "rc",
  "response-cookie": "sc",
};

const SCOPE_PARAM_INVERSE: Record<string, KvLocation> = {
  rh: "request-header",
  sh: "response-header",
  rc: "request-cookie",
  sc: "response-cookie",
};

export function parseScopeParam(raw: string | null): Set<KvLocation> {
  if (raw === null) {
    return new Set<KvLocation>(KV_LOCATIONS);
  }
  const out = new Set<KvLocation>();
  for (const token of raw.split(",")) {
    const trimmed = token.trim().toLowerCase();
    const loc = SCOPE_PARAM_INVERSE[trimmed];
    if (loc) out.add(loc);
  }
  return out;
}

export function serializeScopeParam(scope: Set<KvLocation>): string {
  return KV_LOCATIONS.filter((loc) => scope.has(loc))
    .map((loc) => SCOPE_PARAM[loc])
    .join(",");
}
