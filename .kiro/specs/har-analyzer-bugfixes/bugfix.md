# Bugfix Requirements Document

## Introduction

This document covers a batch of bugs, code quality issues, and a missing spec coverage gap found during a review of the HAR Analyzer application. The issues span rendering correctness (`Cell` component treating `0` as absent), an unused import, duplicate/conflicting Tailwind dark-mode classes, a missing `useMemo` on derived data, a duplicated type definition, misleading output from `formatBytes` for negative values, and a search filter that omits the `harFileName` field contrary to spec §4.1.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a `Cell` component in `ComparisonTable.tsx` receives a `value` of `0` THEN the system renders `—` (the "absent" dash) instead of `0`

1.2 WHEN `app/compare/page.tsx` is compiled THEN the system includes `useSyncExternalStore` in its import list even though it is never referenced in the file

1.3 WHEN the "Clear all" button in `app/page.tsx` is rendered in dark mode THEN the system applies both `dark:text-slate-500` and `dark:text-red-500 dark:text-slate-400 dark:text-red-400` on the same element, causing dead/conflicting utility classes where earlier declarations are silently overridden

1.4 WHEN multiple elements across `app/page.tsx`, `app/details/page.tsx`, and `app/compare/page.tsx` are rendered in dark mode THEN the system applies duplicate or conflicting `dark:` Tailwind utilities on the same element (e.g. `dark:text-slate-500 dark:text-slate-400`, `dark:text-slate-500 dark:text-slate-600`), leaving the first utility dead

1.5 WHEN `app/details/page.tsx` or `app/compare/page.tsx` re-renders for any reason THEN the system recomputes `allEntries` via `.flatMap()` inline at the top of the component body without memoization, repeating the work on every render even when the underlying store has not changed

1.6 WHEN `types/har.ts` is read THEN the system contains two definitions of the same timings shape: a standalone `HarTimings` interface and an identical anonymous inline type on `HarEntry.timings`, so the two definitions must be kept in sync manually

1.7 WHEN `formatBytes` in `utils/harParser.ts` is called with a negative value (e.g. `bodySize: -1`, which is a valid HAR spec sentinel for "unknown") THEN the system returns `'0 B'`, making it impossible for the caller to distinguish "genuinely zero bytes" from "size unknown/not applicable"

1.8 WHEN a user types in the search/filter input on the flat entry table in `app/details/page.tsx` THEN the system only matches against `url`, `contentType`, and `status`, omitting `harFileName`, which contradicts spec §4.1 that requires matching across "URL, content type, status code, and file name fields"

### Expected Behavior (Correct)

2.1 WHEN a `Cell` component receives a `value` of `0` THEN the system SHALL render `0` (the numeric value), reserving `—` only for `undefined` or `null` values

2.2 WHEN `app/compare/page.tsx` is compiled THEN the system SHALL NOT import `useSyncExternalStore` since it is unused, eliminating the dead import

2.3 WHEN the "Clear all" button in `app/page.tsx` is rendered in dark mode THEN the system SHALL apply a single, consistent set of non-conflicting `dark:` Tailwind utilities to the element

2.4 WHEN elements across the codebase are rendered in dark mode THEN the system SHALL apply at most one `dark:` utility per CSS property per element, with no dead/overridden duplicates

2.5 WHEN `app/details/page.tsx` or `app/compare/page.tsx` re-renders THEN the system SHALL derive `allEntries` inside a `useMemo` hook so the `.flatMap()` is only re-executed when the store reference changes

2.6 WHEN `types/har.ts` is read THEN the system SHALL reference `HarTimings` as the type for `HarEntry.timings` rather than repeating the inline type, so the shape is defined in exactly one place

2.7 WHEN `formatBytes` is called with a negative value THEN the system SHALL return a string that communicates "not applicable" or "unknown" (e.g. `'N/A'`) rather than `'0 B'`, so callers can distinguish the HAR sentinel from a genuine zero-byte response

2.8 WHEN a user types in the search/filter input on the flat entry table in `app/details/page.tsx` THEN the system SHALL match the query against `url`, `contentType`, `status`, AND `harFileName` fields, consistent with spec §4.1

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a `Cell` component receives `undefined` THEN the system SHALL CONTINUE TO render `—`

3.2 WHEN a `Cell` component receives a positive integer THEN the system SHALL CONTINUE TO render the formatted number

3.3 WHEN all correctly-used imports in `app/compare/page.tsx` are present THEN the system SHALL CONTINUE TO compile and render without errors after the unused import is removed

3.4 WHEN the "Clear all" button is clicked THEN the system SHALL CONTINUE TO clear all loaded files and reset state

3.5 WHEN Tailwind dark-mode classes that were intentionally distinct are present on an element THEN the system SHALL CONTINUE TO apply those classes correctly after duplicates are resolved

3.6 WHEN the store reference has not changed between renders THEN the system SHALL CONTINUE TO return the same memoized `allEntries` array reference without recomputing

3.7 WHEN `formatBytes` is called with `0` THEN the system SHALL CONTINUE TO return `'0 B'`

3.8 WHEN `formatBytes` is called with a positive value THEN the system SHALL CONTINUE TO return the correct human-readable byte string (e.g. `'1.0 KB'` for `1024`)

3.9 WHEN `HarEntry.timings` is accessed THEN the system SHALL CONTINUE TO expose all the same fields (`send`, `wait`, `receive`, `blocked?`, `dns?`, `connect?`, `ssl?`) after the type deduplication

3.10 WHEN the search/filter input is empty on any detail page THEN the system SHALL CONTINUE TO show all entries unfiltered

3.11 WHEN the search query matches `url`, `contentType`, or `status` THEN the system SHALL CONTINUE TO include those entries in the filtered results

3.12 WHEN the URL detail view (`type=url`) is active THEN the system SHALL CONTINUE TO group results by URL and apply its own search logic unchanged
