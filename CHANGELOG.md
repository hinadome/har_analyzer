# Changelog

## [04/06/2026:bug]

### Fixed

- **Cell zero-value rendering** — `ComparisonTable` now correctly renders `0` for entries with a zero count. Previously `if (!value)` treated `0` as falsy and showed `—` instead.
- **Search filter missing file name field** — The filter input on details pages now matches against the HAR file name in addition to URL, content type, and status code, consistent with the functional spec §4.1.
- **`formatBytes` HAR sentinel handling** — Negative values (e.g. `bodySize: -1`, the HAR spec sentinel for "unknown") now return `'N/A'` instead of `'0 B'`, making unknown sizes visually distinct from genuine zero-byte responses.
- **Unused import removed** — `useSyncExternalStore` was imported but never used in `app/compare/page.tsx`.
- **Duplicate Tailwind dark-mode classes** — Removed conflicting `dark:text-*` utility pairs across `app/page.tsx`, `app/details/page.tsx`, `app/compare/page.tsx`, and `components/ComparisonTable.tsx` where earlier declarations were silently overridden by later ones on the same element.

### Improved

- **`allEntries` memoization** — `store?.analyses.flatMap(...)` in `app/details/page.tsx` and `app/compare/page.tsx` is now wrapped in `useMemo([store])`, avoiding unnecessary recomputation on unrelated re-renders (e.g. sort/page state changes).
- **`HarTimings` type deduplication** — `HarEntry.timings` now references the shared `HarTimings` interface rather than repeating an identical anonymous inline type, so the timing shape is defined in exactly one place.

### Tests

- Added Vitest + `@testing-library/react` test suite (`__tests__/`)
- Bug condition exploration tests confirming all three behavioural bugs were present before fixes
- Preservation property tests locking in correct baseline behaviour as a regression guard
