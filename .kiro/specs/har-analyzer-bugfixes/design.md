# HAR Analyzer Bugfixes — Design

## Overview

This document formalises the fix approach for eight bugs identified in the HAR Analyzer
application. The bugs span a React rendering correctness issue, a dead import, conflicting
Tailwind dark-mode utilities, missing memoisation, a duplicated type definition, incorrect
sentinel handling in a formatting utility, and a missing search field.

Each fix is targeted and minimal: the goal is to correct the defective behaviour described by
the bug condition C(X) while leaving all behaviour outside that condition unchanged (preserved).

---

## Glossary

- **Bug_Condition (C)**: A predicate over inputs/state that identifies when the defective
  behaviour is triggered — i.e., `isBugCondition(input)` returns `true`.
- **Property (P)**: The correct observable behaviour that must hold for every input where
  `isBugCondition(input)` is `true`.
- **Preservation**: All observable behaviour for inputs where `isBugCondition(input)` is
  `false` must remain identical between the original (F) and fixed (F') code.
- **F**: The original, unfixed function or code path.
- **F'**: The fixed function or code path.
- **HAR sentinel**: A value of `-1` used by the HAR spec to mean "unknown / not applicable"
  for numeric byte-size fields such as `bodySize` and `content.size`.
- **`Cell`**: The React component in `components/ComparisonTable.tsx` that renders a table
  cell value or a dash placeholder.
- **`formatBytes`**: The utility function in `utils/harParser.ts` that converts a byte count
  to a human-readable string.
- **`allEntries`**: The derived flat array of every `EntryRecord` across all loaded HAR files,
  computed via `.flatMap((a) => a.entries)`.
- **`HarTimings`**: The interface in `types/har.ts` describing HAR timing phases.
- **`isBugCondition`**: Pseudocode predicate used throughout this document to formally
  specify when each bug is triggered.

---

## Bug Details

### Bug 1 — Cell Zero-Value Rendering (`components/ComparisonTable.tsx`)

#### Bug Condition

The bug manifests when `Cell` receives a `value` of `0`. The guard `if (!value)` uses
JavaScript falsy evaluation, so `0` is treated identically to `undefined`.

```
FUNCTION isBugCondition_1(value)
  INPUT: value of type number | undefined
  OUTPUT: boolean

  RETURN value === 0
END FUNCTION
```

#### Examples

- `Cell({ value: 0 })` → renders `—` (wrong; should render `0`)
- `Cell({ value: undefined })` → renders `—` (correct; preserved)
- `Cell({ value: 42 })` → renders `42` (correct; preserved)

---

### Bug 2 — Unused Import (`app/compare/page.tsx`)

#### Bug Condition

`useSyncExternalStore` is listed in the React import statement but is never called in the
file body.

```
FUNCTION isBugCondition_2(importList, fileBody)
  INPUT: importList — set of imported identifiers
         fileBody   — source text of the file
  OUTPUT: boolean

  RETURN 'useSyncExternalStore' IN importList
         AND NOT usedInBody('useSyncExternalStore', fileBody)
END FUNCTION
```

#### Examples

- Current import line contains `useSyncExternalStore` but no call site exists → bug present
- After removal the file compiles and behaves identically → bug fixed

---

### Bug 3 — Conflicting Dark-Mode Classes on "Clear all" Button (`app/page.tsx`)

#### Bug Condition

The "Clear all" button element carries multiple conflicting `dark:text-*` utilities for the
same CSS property. Earlier declarations are silently overridden by later ones in the same
class string.

```
FUNCTION isBugCondition_3(classString)
  INPUT: classString — the Tailwind class attribute value of the element
  OUTPUT: boolean

  darkTextClasses := FILTER classString BY prefix 'dark:text-'
  RETURN COUNT(darkTextClasses) > 1
         AND any two classes target the same CSS property
END FUNCTION
```

Current class string on the button:
```
"text-sm text-slate-600 dark:text-slate-500
 hover:text-red-700 dark:text-red-500 dark:text-slate-400
 dark:hover:text-red-600 dark:text-red-400 transition-colors ..."
```
The conflicts are: `dark:text-slate-500` vs `dark:text-slate-400`, and `dark:text-red-500`
vs `dark:text-red-400`.

#### Examples

- In dark mode, intended resting colour `dark:text-slate-400` is shadowed by the earlier
  `dark:text-slate-500` on the same element → dead utility
- In dark mode, intended hover colour `dark:hover:text-red-400` is shadowed by the earlier
  `dark:text-red-500` declaration (which has no hover modifier) — applied unconditionally

---

### Bug 4 — Duplicate/Conflicting Dark-Mode Utilities Across Pages

#### Bug Condition

Multiple elements across `app/page.tsx`, `app/details/page.tsx`, and `app/compare/page.tsx`
have two or more `dark:` utilities targeting the same CSS property on the same element.

```
FUNCTION isBugCondition_4(element)
  INPUT: element — any DOM element with a Tailwind class attribute
  OUTPUT: boolean

  FOR EACH cssProperty IN CSS_PROPERTIES DO
    darkClasses := FILTER element.classNames
                   BY (prefix 'dark:' AND targets cssProperty)
    IF COUNT(darkClasses) > 1 THEN RETURN true
  END FOR
  RETURN false
END FUNCTION
```

Confirmed occurrences (from source review):

| File | Element / context | Conflicting pair |
|---|---|---|
| `ComparisonTable.tsx` | `thClass` const | `dark:text-slate-500 dark:text-slate-400` |
| `ComparisonTable.tsx` | Server IPs "no data" cell | `dark:text-slate-500 dark:text-slate-600` |
| `app/details/page.tsx` | `SortIcon` inactive span | `dark:text-slate-500 dark:text-slate-600` |
| `app/details/page.tsx` | loading/empty state divs | `dark:text-slate-500 dark:text-slate-400` |
| `app/compare/page.tsx` | `SortIcon` inactive span | `dark:text-slate-500 dark:text-slate-600` |
| `app/compare/page.tsx` | multiple `—` placeholder spans | `dark:text-slate-500 dark:text-slate-600` |
| `app/page.tsx` | "Clear all" button (covered by Bug 3) | multiple conflicts |

---

### Bug 5 — Un-memoized `allEntries` Derivation

#### Bug Condition

`allEntries` is declared as a plain `const` at the top of the component body in both
`app/details/page.tsx` and `app/compare/page.tsx`. It is recomputed on every render
regardless of whether `store` has changed.

```
FUNCTION isBugCondition_5(renderCause)
  INPUT: renderCause — the reason the component re-rendered
  OUTPUT: boolean

  RETURN allEntries IS NOT wrapped in useMemo
         AND renderCause != 'store reference changed'
END FUNCTION
```

#### Examples

- Sorting the table changes `sortField` state → component re-renders → `flatMap` runs
  needlessly over all entries
- Paginating changes `page` state → same unnecessary recompute
- Any parent re-render propagating down → same issue

---

### Bug 6 — Duplicated `HarTimings` Type (`types/har.ts`)

#### Bug Condition

The file defines the timings shape twice: once as the exported `HarTimings` interface and
once as an anonymous inline type on `HarEntry.timings`. The two definitions are structurally
identical but are not linked, so a future field addition requires two edits.

```
FUNCTION isBugCondition_6(sourceFile)
  INPUT: sourceFile — contents of types/har.ts
  OUTPUT: boolean

  inlineShape   := typeOf(HarEntry.timings)   // anonymous inline object type
  standaloneType := typeOf(HarTimings)         // exported interface

  RETURN inlineShape IS structurallyEquivalent(standaloneType)
         AND HarEntry.timings IS NOT referencing HarTimings
END FUNCTION
```

---

### Bug 7 — `formatBytes` Mishandles HAR Sentinel `-1` (`utils/harParser.ts`)

#### Bug Condition

`formatBytes` uses `if (bytes <= 0) return '0 B'`, so both `0` (genuine zero bytes) and any
negative HAR sentinel value (e.g. `-1`) return `'0 B'`, making them indistinguishable.

```
FUNCTION isBugCondition_7(bytes)
  INPUT: bytes — number passed to formatBytes
  OUTPUT: boolean

  RETURN bytes < 0
END FUNCTION
```

#### Examples

- `formatBytes(-1)` → `'0 B'` (wrong; HAR spec sentinel for "unknown", should be `'N/A'`)
- `formatBytes(0)`  → `'0 B'` (correct; preserved)
- `formatBytes(1024)` → `'1.0 KB'` (correct; preserved)

---

### Bug 8 — Search Filter Omits `harFileName` Field (`app/details/page.tsx`)

#### Bug Condition

The `filtered` memo in `DetailsPageContent` matches the search query only against `url`,
`contentType`, and `status`. The `harFileName` field is absent despite spec §4.1 requiring it.

```
FUNCTION isBugCondition_8(query, entry)
  INPUT: query — non-empty search string (lowercased)
         entry — EntryRecord
  OUTPUT: boolean  (true = the bug can hide a relevant result)

  matchesFileName := entry.harFileName.toLowerCase().includes(query)
  matchesOtherFields := entry.url.toLowerCase().includes(query)
                     OR entry.contentType.toLowerCase().includes(query)
                     OR String(entry.status).includes(query)

  RETURN matchesFileName AND NOT matchesOtherFields
         // entry would be correctly shown if harFileName were checked,
         // but is incorrectly hidden because only the other three are checked
END FUNCTION
```

#### Examples

- User types `"api.har"` (a file name) → no entries shown (wrong; all entries from
  `api.har` should appear)
- User types `"200"` → entries with status 200 still appear (correct; preserved)

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviours (global):**
- `Cell` rendering `—` for `undefined` values must continue unchanged
- `Cell` rendering formatted numbers for any positive integer must continue unchanged
- All correctly-used imports in `app/compare/page.tsx` must remain; the file must compile
- The "Clear all" button must continue to clear state when clicked
- Intentionally distinct Tailwind classes (non-duplicated ones) must remain untouched
- When the store reference has not changed, `allEntries` must return the same array reference
- `formatBytes(0)` must continue to return `'0 B'`
- `formatBytes(positive)` must continue to return the correct human-readable string
- All fields on `HarEntry.timings` (`send`, `wait`, `receive`, `blocked?`, `dns?`,
  `connect?`, `ssl?`) must remain accessible after the type deduplication
- Filtering by `url`, `contentType`, and `status` must continue to work after the search fix
- The URL detail view (`type=url`) grouping and its own search logic must remain unchanged
- An empty search input must continue to show all entries unfiltered

**Scope:**
All inputs/states that do NOT satisfy the respective `isBugCondition` predicate must be
completely unaffected by each fix.

---

## Hypothesized Root Cause

1. **Bug 1 — Falsy guard**: The `Cell` component uses `if (!value)` instead of
   `if (value === undefined || value === null)`. JavaScript's `!` operator coerces `0` to
   `true`, so zero is treated as absent.

2. **Bug 2 — Leftover import**: `useSyncExternalStore` was likely imported during an early
   implementation draft that used it for store subscription, then the implementation was
   refactored to use a custom hook (`useHarStore`) but the import was not cleaned up.

3. **Bug 3 & 4 — Copy-paste class accumulation**: Dark-mode variants were added
   incrementally (e.g. first `dark:text-slate-500`, later corrected to
   `dark:text-slate-400`) without removing the earlier declaration, leaving both on the
   element. Tailwind does not warn about duplicate utilities.

4. **Bug 5 — Missing `useMemo` wrapper**: `allEntries` was written as a simple `const`
   assignment. Because it is placed at the top level of the component body (not inside a
   `useMemo`), React recomputes it on every render. With large HAR files this is wasteful.

5. **Bug 6 — Incremental type growth**: `HarTimings` was likely added as a standalone
   interface after the `HarEntry.timings` inline type already existed, but the inline type
   was never updated to reference the new interface.

6. **Bug 7 — Off-by-one sign check**: The guard `bytes <= 0` intentionally handles the `0`
   edge case but inadvertently also catches all negative values. The fix needs a strict
   equality check for zero and a separate early-return for negatives.

7. **Bug 8 — Incomplete filter predicate**: The search filter was written to cover the three
   most obvious fields (`url`, `contentType`, `status`) but `harFileName` — which is
   explicitly required by spec §4.1 — was omitted, possibly because the column was added to
   the UI table later than the filter logic.

---

## Correctness Properties

Property 1: Bug Condition — Cell Renders Zero as Numeric Value

_For any_ `value` passed to `Cell` where `isBugCondition_1(value)` is true (i.e. `value === 0`),
the fixed `Cell` component SHALL render the numeric text `"0"` rather than the placeholder dash.

**Validates: Requirements 2.1**

Property 2: Preservation — Cell Renders Dash for Undefined and Numbers for Positives

_For any_ `value` where `isBugCondition_1(value)` is false (i.e. `value` is `undefined` or a
positive integer), the fixed `Cell` component SHALL produce exactly the same output as the
original, preserving the dash for `undefined` and the localised number string for positive values.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition — `formatBytes` Returns `'N/A'` for Negative Inputs

_For any_ `bytes` value where `isBugCondition_7(bytes)` is true (i.e. `bytes < 0`), the fixed
`formatBytes` function SHALL return `'N/A'`, clearly distinguishing the HAR sentinel from a
genuine zero-byte response.

**Validates: Requirements 2.7**

Property 4: Preservation — `formatBytes` Unchanged for Zero and Positive Inputs

_For any_ `bytes` value where `isBugCondition_7(bytes)` is false (i.e. `bytes >= 0`), the fixed
`formatBytes` function SHALL return exactly the same string as the original function, preserving
`'0 B'` for zero and the correct human-readable string for positive values.

**Validates: Requirements 3.7, 3.8**

Property 5: Bug Condition — Search Filter Matches on `harFileName`

_For any_ (query, entry) pair where `isBugCondition_8(query, entry)` is true (i.e. the query
matches `entry.harFileName` but not the other three fields), the fixed filter SHALL include that
entry in the filtered results.

**Validates: Requirements 2.8**

Property 6: Preservation — Search Filter Continues to Match Existing Fields

_For any_ (query, entry) pair where the query matches `url`, `contentType`, or `status` (and
`isBugCondition_8` is false), the fixed filter SHALL produce the same inclusion/exclusion
decision as the original filter, preserving existing search behaviour.

**Validates: Requirements 3.10, 3.11**

Property 7: Preservation — `allEntries` Referential Stability When Store Unchanged

_For any_ re-render where the `store` reference has not changed, the fixed `allEntries` value
(wrapped in `useMemo`) SHALL return the same array reference as the previous render, producing
no unnecessary recomputation.

**Validates: Requirements 3.6**

---

## Fix Implementation

### Fix 1 — `Cell` zero-value guard

**File**: `components/ComparisonTable.tsx`  
**Function**: `Cell`

**Change**: Replace the falsy guard with an explicit `undefined`/`null` check.

```diff
- if (!value) return <span className="text-slate-600">—</span>;
+ if (value === undefined || value === null) return <span className="text-slate-600">—</span>;
```

---

### Fix 2 — Remove unused import

**File**: `app/compare/page.tsx`  
**Import statement** (line 1):

**Change**: Remove `useSyncExternalStore` from the destructured React import.

```diff
- import { useState, useMemo, useSyncExternalStore, Suspense, Fragment } from 'react';
+ import { useState, useMemo, Suspense, Fragment } from 'react';
```

---

### Fix 3 & 4 — Resolve conflicting Tailwind dark-mode utilities

For each element carrying duplicate `dark:` utilities targeting the same CSS property, keep
only the intended (last/correct) value and remove the dead earlier one.

**Files**: `components/ComparisonTable.tsx`, `app/details/page.tsx`, `app/compare/page.tsx`,
`app/page.tsx`

Representative changes:

| Location | Remove | Keep |
|---|---|---|
| `app/page.tsx` — "Clear all" button resting colour | `dark:text-slate-500` | `dark:text-slate-400` |
| `app/page.tsx` — "Clear all" button hover colour | `dark:text-red-500` | (keep `dark:hover:text-red-400`; remove bare `dark:text-red-500`) |
| `ComparisonTable.tsx` — `thClass` | `dark:text-slate-500` | `dark:text-slate-400` |
| `ComparisonTable.tsx` — Server IPs no-data cell | `dark:text-slate-500` | `dark:text-slate-600` |
| `app/details/page.tsx` — `SortIcon` inactive | `dark:text-slate-500` | `dark:text-slate-600` |
| `app/details/page.tsx` — loading/empty divs | `dark:text-slate-500` | `dark:text-slate-400` |
| `app/compare/page.tsx` — `SortIcon` inactive | `dark:text-slate-500` | `dark:text-slate-600` |
| `app/compare/page.tsx` — `—` placeholder spans | `dark:text-slate-500` | `dark:text-slate-600` |

The general rule: where the intent is a *lighter* muted colour (`slate-400`) keep that; where
the intent is a *darker* muted colour (`slate-600`) keep that. Refer to surrounding elements
for visual hierarchy context when ambiguous.

---

### Fix 5 — Memoize `allEntries`

**Files**: `app/details/page.tsx`, `app/compare/page.tsx`

**Change**: Wrap the `flatMap` derivation in a `useMemo` that depends on `store`.

```diff
- const allEntries = store?.analyses.flatMap((a) => a.entries) ?? [];
+ const allEntries = useMemo(
+   () => store?.analyses.flatMap((a) => a.entries) ?? [],
+   [store]
+ );
```

`useMemo` is already imported in both files, so no new import is needed.

---

### Fix 6 — Deduplicate `HarTimings` type

**File**: `types/har.ts`

**Change**: Replace the anonymous inline type on `HarEntry.timings` with a reference to
the existing `HarTimings` interface. No structural change; the fields are identical.

```diff
  export interface HarEntry {
    ...
-   timings: {
-     send: number;
-     wait: number;
-     receive: number;
-     blocked?: number;
-     dns?: number;
-     connect?: number;
-     ssl?: number;
-   };
+   timings: HarTimings;
  }
```

`HarTimings` is already defined later in the same file. Move it above `HarEntry` if needed
to avoid forward-reference issues (TypeScript interfaces are hoisted, so order does not
technically matter, but placing it before its first use is conventional).

---

### Fix 7 — `formatBytes` sentinel handling

**File**: `utils/harParser.ts`  
**Function**: `formatBytes`

**Change**: Add an early return for negative values before the existing zero check.

```diff
  export function formatBytes(bytes: number): string {
-   if (bytes <= 0) return '0 B';
+   if (bytes < 0) return 'N/A';
+   if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    ...
  }
```

---

### Fix 8 — Add `harFileName` to search filter

**File**: `app/details/page.tsx`  
**Memo**: `filtered` inside `DetailsPageContent`

**Change**: Extend the search predicate to include `e.harFileName`.

```diff
  entries = entries.filter(
    (e) =>
      e.url.toLowerCase().includes(q) ||
      e.contentType.toLowerCase().includes(q) ||
-     String(e.status).includes(q)
+     String(e.status).includes(q) ||
+     e.harFileName.toLowerCase().includes(q)
  );
```

---

## Testing Strategy

### Validation Approach

Each fix is validated in two phases:

1. **Exploratory / Bug Condition Checking** — run tests against the *unfixed* code to
   confirm the bug is reproducible and to understand the root cause.
2. **Fix + Preservation Checking** — after applying each fix, verify that (a) the bug
   condition no longer triggers and (b) all previously correct behaviour is unchanged.

Property-based testing (PBT) is recommended for fixes 1, 7, and 8 because their input
domains are continuous or large, making manual enumeration impractical. Fixes 2–6 are
structural/static and are validated by compilation and targeted unit tests.

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples on *unfixed* code to confirm root causes before touching
production code.

**Test Plan for Bug 1 (Cell):**
```
render <Cell value={0} />
ASSERT output contains '0'           // will FAIL on unfixed code → confirms falsy guard
render <Cell value={undefined} />
ASSERT output contains '—'           // should PASS (preserved path)
```

**Test Plan for Bug 7 (formatBytes):**
```
ASSERT formatBytes(-1) === 'N/A'     // will FAIL on unfixed code → returns '0 B'
ASSERT formatBytes(-100) === 'N/A'   // will FAIL on unfixed code
ASSERT formatBytes(0) === '0 B'      // should PASS (preserved path)
```

**Test Plan for Bug 8 (search filter):**
```
entries = [{ url: 'x', contentType: 'y', status: 200, harFileName: 'api.har', ... }]
filtered = applySearch(entries, 'api.har')
ASSERT filtered.length === 1         // will FAIL on unfixed code → returns 0
```

**Expected Counterexamples:**
- `Cell(0)` renders `—` instead of `0` (confirms `!value` falsy coercion)
- `formatBytes(-1)` returns `'0 B'` instead of `'N/A'` (confirms `<= 0` over-broad guard)
- Search for a file name returns empty results (confirms missing `harFileName` predicate)

---

### Fix Checking

```
FOR ALL value WHERE isBugCondition_1(value) DO       // value === 0
  result := Cell_fixed({ value })
  ASSERT result renders '0'
END FOR

FOR ALL bytes WHERE isBugCondition_7(bytes) DO       // bytes < 0
  result := formatBytes_fixed(bytes)
  ASSERT result === 'N/A'
END FOR

FOR ALL (query, entry) WHERE isBugCondition_8(query, entry) DO
  result := applySearch_fixed([entry], query)
  ASSERT entry IN result
END FOR
```

---

### Preservation Checking

```
FOR ALL value WHERE NOT isBugCondition_1(value) DO   // undefined or positive
  ASSERT Cell_original({ value }) = Cell_fixed({ value })
END FOR

FOR ALL bytes WHERE NOT isBugCondition_7(bytes) DO   // bytes >= 0
  ASSERT formatBytes_original(bytes) = formatBytes_fixed(bytes)
END FOR

FOR ALL (query, entry) WHERE NOT isBugCondition_8(query, entry) DO
  ASSERT applySearch_original([entry], query) = applySearch_fixed([entry], query)
END FOR
```

**Why PBT for preservation:**
- For `Cell`: generates random positive integers and verifies rendered text equals
  `value.toLocaleString()` in both original and fixed code.
- For `formatBytes`: generates random non-negative floats across the B/KB/MB/GB range and
  asserts the output string is unchanged.
- For the search filter: generates random `EntryRecord`-shaped objects and query strings
  where the query does not match `harFileName`, verifying the filter decision is unchanged.

---

### Unit Tests

- `Cell` with `value = 0` renders `"0"` (not `"—"`)
- `Cell` with `value = undefined` renders `"—"`
- `Cell` with `value = 1` renders `"1"`
- `formatBytes(-1)` returns `'N/A'`
- `formatBytes(-999)` returns `'N/A'`
- `formatBytes(0)` returns `'0 B'`
- `formatBytes(1024)` returns `'1.0 KB'`
- `formatBytes(1048576)` returns `'1.0 MB'`
- Search filter with query matching only `harFileName` returns the entry
- Search filter with query matching `url` still returns the entry (preserved)
- Search filter with empty query returns all entries (preserved)
- `app/compare/page.tsx` compiles without `useSyncExternalStore` import
- `HarEntry.timings` type equals `HarTimings` structurally after deduplication
- `allEntries` memo dependency triggers only when `store` reference changes

### Property-Based Tests

- For all integers `n >= 0`: `formatBytes(n)` returns the same string before and after fix
- For all integers `n < 0`: `formatBytes(n)` returns `'N/A'` after fix
- For all `value` in `0..Number.MAX_SAFE_INTEGER`: `Cell_fixed` renders the localised
  number string (not `—`)
- For all random `EntryRecord` arrays and query strings not matching `harFileName`: the
  fixed filter returns the same set as the original filter (preservation)
- For all random `EntryRecord` arrays and query strings matching only `harFileName`: the
  fixed filter includes those entries

### Integration Tests

- Load a HAR file; the comparison table correctly shows `0` in cells where a status code
  or content-type count is zero for one of the files
- Load a HAR file with `-1` body sizes; size column in the details table shows `'N/A'`
  rather than `'0 B'`
- Type a HAR file name into the details page search box; only entries from that file are
  shown
- Dark mode toggle produces consistent muted colours across all pages (no jarring
  inconsistencies from conflicting classes)
- Sort or paginate the details table; re-renders do not cause observable lag on large files
  (memoisation smoke test)
