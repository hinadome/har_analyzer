# Changelog

## [0.1.0]

### Added

- **Content Diff page (`/content-diff`)** — new page for comparing response body content across HAR entries for the same URL. Features:
  - URL search with live filtering and grouped dropdown (base path as header, full URLs with query strings as sub-items)
  - "Ignore query string" toggle — groups entries by base path so requests to the same endpoint with different query params can be compared side by side
  - Entry table showing HAR file name, full URL (clickable — links to `/compare` page), status, content type, size, and UTC timestamp per entry
  - Baseline / Compare radio selection for any two entries
  - Unified and side-by-side diff modes with line numbers
  - Intra-line character/word-level highlighting on changed lines
  - JSON auto-prettification (2-space indent) before diffing for `application/json` and `+json` content types
  - "Identical" banner when both response bodies match exactly
  - Binary/missing content fallback showing size comparison instead of diff
  - Large payload truncation at 50,000 characters with per-entry "Show full content" toggle
  - Pre-populated via `?url=` query parameter when navigating from the compare page
  - Baseline / Compare metadata cards shown above the diff panel (HAR file name, full URL, status, UTC timestamp)
- **Header Diff page (`/header-diff`)** — new page for comparing request/response headers and cookies between any two HAR entries for the same URL. Features:
  - Same URL search, grouped dropdown, and "Ignore query string" toggle as the Content Diff page
  - Entry table showing HAR file, full URL (links to `/compare`), status, req/res header counts, req/res cookie counts, and UTC timestamp
  - Baseline / Compare radio selection for any two entries
  - Four diff sections: Request Headers, Response Headers, Request Cookies, Response Cookies
  - Color-coded key-value diff table: red `−` for removed, green `+` for added, amber `~` for changed (old value struck through, new value highlighted), no highlight for equal
  - Header names compared case-insensitively per HTTP spec; values compared case-sensitively
  - Multi-value headers matched positionally per name
  - "Identical" banner when all four sections match exactly
  - Metadata bar showing both selected entries (file, URL, status, timestamp) before the diff
  - Pre-populated via `?url=` query parameter
- **"Header Diff" link on compare page** — button added next to "Content Diff" in the URL title area, navigating to `/header-diff?url={encoded}`
- **Sample HAR files** (`sample-hars/`) — three sample files for testing: `sample-a.har` (baseline), `sample-b.har` (modified responses for diffing), `sample-c.har` (query string variants and status changes)

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
- Property-based tests (via `fast-check`) for `contentDiff.ts` utilities covering identity detection, diff line classification, line number assignment, intra-line span reconstruction, JSON prettification round-trip, and truncation correctness
