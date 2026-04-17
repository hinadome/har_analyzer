# Implementation Plan: Content Diff

## Overview

Implement the `/content-diff` page for HAR Analyzer, enabling users to compare response body content across HAR entries for the same URL. The feature is entirely client-side and builds on the existing `useHarStore()` hook and the `diff` npm package.

## Tasks

- [x] 1. Install dependencies
  - Run `npm install diff` and `npm install --save-dev @types/diff fast-check` to add the `diff` package and its types, plus `fast-check` for property-based tests
  - Verify both packages appear in `package.json` under the correct dependency groups
  - _Requirements: 5.7_

- [x] 2. Create `utils/contentDiff.ts` with all pure functions
  - [x] 2.1 Implement `entryId`, `isBinaryEntry`, `prettifyIfJson`, and `truncateBody`
    - `entryId(e: EntryRecord): string` — composite key `${e.harFileIndex}::${e.startedDateTime}::${e.url}`
    - `isBinaryEntry` — check `responseContent === undefined` or `contentType` starts with a binary MIME prefix (`image/`, `audio/`, `video/`, `font/`, `application/octet-stream`, `application/zip`, `application/pdf`)
    - `prettifyIfJson` — detect `application/json` or `+json` suffix; try `JSON.parse` + `JSON.stringify(parsed, null, 2)`; return `{ text, wasPrettified }`; fall back silently on `SyntaxError`
    - `truncateBody` — slice to `TRUNCATION_LIMIT = 50_000` when `showFull === false`; return `{ text, wasTruncated, fullLength }`
    - Export all types: `IntraSpan`, `DiffLine`, `DiffChunk`, `DiffResult`
    - _Requirements: 5.9, 6.1, 7.1, 7.2, 7.3, 7.4_

  - [x] 2.2 Implement `computeDiff`
    - Import `diffLines` and `diffWordsWithSpace` from the `diff` package
    - Build `leftLines[]`, `rightLines[]`, `unifiedLines[]` from `diffLines` output; split each change's `.value` on `'\n'` and drop trailing empty entries
    - Assign 1-based `lineNumber` to every non-placeholder line; push `kind: 'placeholder'` lines to the opposite side for row alignment in side-by-side mode
    - Intra-line pass: for each index where `leftLines[i].kind === 'removed'` and `rightLines[i].kind === 'added'`, call `diffWordsWithSpace` and populate `.spans` on both lines; skip placeholders
    - Wrap entire body in try/catch; return `null`-equivalent fallback on error (caller handles gracefully)
    - Set `identical = (baseline === compare)` and `prettified` flag
    - _Requirements: 4.1, 5.2, 5.3, 5.5, 5.8_

- [x] 3. Write tests for `utils/contentDiff.ts`
  - [x] 3.1 Write unit tests for `isBinaryEntry`, `prettifyIfJson`, `truncateBody`, and `entryId`
    - `isBinaryEntry`: test each binary MIME prefix, non-binary types, undefined `responseContent`
    - `prettifyIfJson`: valid JSON prettified, invalid JSON falls back to raw, non-JSON passthrough
    - `truncateBody`: body at limit, below limit, above limit; `showFull` flag
    - `entryId`: uniqueness for different `harFileIndex` and `startedDateTime`
    - Place in `__tests__/contentDiff.test.ts`
    - _Requirements: 5.9, 6.1, 7.1–7.4_

  - [ ]* 3.2 Write property test — Property 4: Binary entry classification
    - **Property 4: Binary entry classification**
    - **Validates: Requirements 6.1, 6.2**
    - Use `fc.record` to generate `EntryRecord`-shaped objects; assert `isBinaryEntry` returns `true` iff `responseContent` is `undefined` or `contentType` starts with a binary prefix

  - [ ]* 3.3 Write property test — Property 5: Identity detection
    - **Property 5: Identity detection**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - For any `fc.string()` `s`, assert `computeDiff(s, s).identical === true`, all `unifiedLines` have `kind === 'equal'`, and `leftLines` structurally equals `rightLines`

  - [ ]* 3.4 Write property test — Property 6: Diff line classification correctness
    - **Property 6: Diff line classification correctness**
    - **Validates: Requirements 5.2, 5.3**
    - For any two `fc.string()` values `a` and `b`, assert that lines exclusive to `a` appear as `kind === 'removed'` in `leftLines` and lines exclusive to `b` appear as `kind === 'added'` in `rightLines`

  - [ ]* 3.5 Write property test — Property 7: Line numbers assigned to all content lines
    - **Property 7: Line numbers assigned to all content lines**
    - **Validates: Requirements 5.5**
    - For any two strings, every `DiffLine` with `kind !== 'placeholder'` must have `lineNumber > 0`, and line numbers must be strictly increasing within each side

  - [ ]* 3.6 Write property test — Property 8: Intra-line spans for changed paired lines
    - **Property 8: Intra-line spans populated for changed paired lines**
    - **Validates: Requirements 5.8**
    - For any two distinct single-line strings, assert at least one `DiffLine` has non-empty `spans`, every span's `text` is non-empty, and concatenating all spans reconstructs the original line text

  - [ ]* 3.7 Write property test — Property 9: JSON prettification round-trip
    - **Property 9: JSON prettification round-trip**
    - **Validates: Requirements 5.9, 5.10**
    - Use `fc.jsonValue()` to generate valid JSON objects; assert `wasPrettified === true` and `JSON.parse(result.text)` deeply equals the original

  - [ ]* 3.8 Write property test — Property 10: Truncation correctness
    - **Property 10: Truncation correctness**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    - For strings above limit: `truncateBody(s, false).text.length === 50_000` and `wasTruncated === true`; for `showFull === true`: text equals `s`; for strings at or below limit: text equals `s` and `wasTruncated === false`

  - [x] 3.9 Checkpoint — run tests
    - Ensure all tests pass. Ask the user if any questions arise.

- [x] 4. Create `UnifiedDiffView` and `SideBySideDiffView` components
  - [x] 4.1 Create `components/UnifiedDiffView.tsx`
    - Accept `DiffViewProps { result: DiffResult }`
    - Render a single scrollable `<pre>` panel iterating over `result.unifiedLines`
    - For each line: show 1-based line number in a fixed-width gutter; prefix `-` for `removed`, `+` for `added`, ` ` for `equal`
    - Apply background/text colours: red tint for `removed`, green tint for `added`, no highlight for `equal`
    - When `line.spans` is non-empty, render each `IntraSpan` as an inline `<span>` with stronger highlight for the changed kind; otherwise render `line.text` as-is
    - _Requirements: 5.1, 5.2, 5.5, 5.8_

  - [x] 4.2 Create `components/SideBySideDiffView.tsx`
    - Accept `DiffViewProps { result: DiffResult }`
    - Render two side-by-side panels using a CSS grid or flex layout; left panel uses `result.leftLines`, right panel uses `result.rightLines`
    - Render line numbers, per-line colouring, and intra-line spans with the same logic as `UnifiedDiffView`
    - Placeholder lines (`kind === 'placeholder'`) render as empty rows to preserve row alignment between panels
    - _Requirements: 5.1, 5.3, 5.5, 5.8_

- [x] 5. Create `app/content-diff/page.tsx`
  - [x] 5.1 Implement page shell and `searchParams` unwrapping
    - Add `'use client'` directive; import `use` from React
    - Default export `ContentDiffPage` receives `{ searchParams: Promise<...> }` prop and unwraps it with `use(searchParams)` — do NOT use `useSearchParams()` from `next/navigation` for the page-level prop
    - Wrap inner content in a `<Suspense>` boundary with a loading fallback (same pattern as `/compare`)
    - _Requirements: 8.2_

  - [x] 5.2 Implement `ContentDiffPageContent` — store wiring and URL state
    - Call `useHarStore()` and derive unique URLs via `useMemo` (deduplicated, sorted)
    - Initialise `urlInput` and `selectedUrl` from the `url` query param on mount
    - When `selectedUrl` changes, reset `baselineId` and `compareId`
    - Filter entries for `selectedUrl` via `useMemo`
    - Handle "no HAR data loaded" and "URL not found" states with appropriate messages
    - _Requirements: 1.4, 1.5, 1.7, 3.5, 8.2, 8.3_

  - [x] 5.3 Implement `UrlSearchInput` sub-component and header
    - Controlled text input; filter `uniqueUrls` case-insensitively; show candidate dropdown
    - On selection: call `onSelect`; hide dropdown
    - Show "no matching URLs" when input is non-empty and candidates list is empty
    - Header nav bar with back link and `ThemeToggle` (same structure as `/compare`)
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [x] 5.4 Implement `EntrySelector` and `SelectedUrlBanner`
    - `SelectedUrlBanner`: render selected URL in a visually prominent monospace block above the entry list
    - `EntrySelector`: one row per `EntryRecord`; each row has a "Baseline" radio and a "Compare" radio plus metadata (HAR file name, status badge, content type, size in human-readable bytes, UTC timestamp)
    - Show a "binary / no content" badge for binary entries
    - When URL has only one entry, show informational message: only one entry available, diff requires two
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.4_

  - [x] 5.5 Implement `DiffPanel` and validation
    - Gate rendering: do not render `DiffPanel` when `baselineId === compareId` — show validation message instead
    - `DiffPanel` receives baseline/compare `EntryRecord`s, mode, truncation state, and callbacks
    - Compute `diffResult` via `useMemo` calling `isBinaryEntry`, `truncateBody`, `prettifyIfJson`, then `computeDiff`
    - Show `BinaryFallback` (size comparison, explanation message) when either entry is binary
    - Show `IdenticalBadge` when `diffResult.identical === true`
    - Show "prettified" label when `diffResult.prettified === true`
    - Show `TruncationNotice` for each truncated entry with "Show full content" / "Show less" toggle
    - Render `DiffModeToggle` (Unified / Side-by-Side buttons); default to `'unified'`
    - Render `UnifiedDiffView` or `SideBySideDiffView` based on mode
    - _Requirements: 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.6, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4_

- [x] 6. Add "Content Diff" link to `app/compare/page.tsx`
  - In the `ComparePageContent` component, locate the URL title section that renders the active URL
  - Add a `<Link href={`/content-diff?url=${encodeURIComponent(url)}`}>Content Diff</Link>` button/link next to the URL display, styled consistently with the rest of the page
  - _Requirements: 1.7, 8.1_

- [x] 7. End-to-end integration check
  - [x] 7.1 Run TypeScript compilation check
    - Run `npx tsc --noEmit` and fix any type errors in the new files
    - Ensure `DiffResult`, `DiffLine`, `IntraSpan` types are correctly imported wherever they are used
    - _Requirements: all_

  - [ ]* 7.2 Run the full test suite
    - Run `npx vitest --run` and confirm all tests pass including property tests
    - Fix any failures before marking complete
    - _Requirements: all_

  - [x] 7.3 Run ESLint
    - Run `npx eslint app/content-diff utils/contentDiff.ts components/UnifiedDiffView.tsx components/SideBySideDiffView.tsx` and resolve any lint errors
    - _Requirements: all_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `searchParams` on page-level client components must be unwrapped with `use(searchParams)` — not `useSearchParams()` — per Next.js 16 conventions
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations each; tag format: `Feature: content-diff, Property N: <property text>`
- Unit tests and property tests both live in `__tests__/contentDiff.test.ts`
- Checkpoints ensure incremental validation before adding complexity
