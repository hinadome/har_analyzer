# Implementation Plan

- [x] 1. Write bug condition exploration tests (before any fixes)
  - **Property 1: Bug Condition** - Cell Zero-Value, formatBytes Sentinel, Search Filter Missing harFileName
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **GOAL**: Surface counterexamples that demonstrate each bug exists
  - **Scoped PBT Approach**: Scope each property to the concrete failing cases for reproducibility
  - Bug 1: Render `<Cell value={0} />` and assert output contains `"0"` (will FAIL — renders `—` due to `!value` falsy guard)
  - Bug 7: Assert `formatBytes(-1) === 'N/A'` and `formatBytes(-999) === 'N/A'` (will FAIL — returns `'0 B'` due to `<= 0` guard)
  - Bug 8: Build an entries array where `harFileName` matches the query but `url`, `contentType`, `status` do not; assert filtered length > 0 (will FAIL — `harFileName` absent from predicate)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All three FAIL (proves the bugs exist)
  - Document counterexamples found (e.g., `Cell(0)` → `—`, `formatBytes(-1)` → `'0 B'`, search `"api.har"` → 0 results)
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.7, 1.8_

- [x] 2. Write preservation property tests (before implementing fixes)
  - **Property 2: Preservation** - Cell Non-Zero, formatBytes Non-Negative, Search Existing Fields
  - **IMPORTANT**: Follow observation-first methodology — observe UNFIXED code output first
  - Observe: `Cell({ value: undefined })` renders `—` on unfixed code
  - Observe: `Cell({ value: 42 })` renders `"42"` on unfixed code
  - Observe: `formatBytes(0)` returns `'0 B'` on unfixed code
  - Observe: `formatBytes(1024)` returns `'1.0 KB'` on unfixed code
  - Observe: Search for `"200"` on entries with `status: 200` returns those entries on unfixed code
  - Write property-based tests:
    - For all `value` that is `undefined`: `Cell` renders `—`
    - For all positive integers `n > 0`: `Cell({ value: n })` renders `n.toLocaleString()`
    - For all `bytes >= 0`: `formatBytes(bytes)` returns the same string as the original
    - For all (query, entry) pairs where query matches `url`, `contentType`, or `status`: filter includes entry
    - Empty query returns all entries unfiltered
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All PASS (confirms baseline behaviour to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.7, 3.8, 3.10, 3.11_

- [x] 3. Apply all eight bugfixes

  - [x] 3.1 Fix Bug 1 — Cell zero-value guard (`components/ComparisonTable.tsx`)
    - Change `if (!value)` to `if (value === undefined || value === null)` in the `Cell` component
    - _Bug_Condition: isBugCondition_1(value) where value === 0_
    - _Expected_Behavior: Cell renders the numeric text "0" instead of "—"_
    - _Preservation: Cell continues to render "—" for undefined and localised number for positive integers_
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 3.2 Fix Bug 2 — Remove unused import (`app/compare/page.tsx`)
    - Remove `useSyncExternalStore` from the React import destructure on line 1
    - Change: `import { useState, useMemo, useSyncExternalStore, Suspense, Fragment } from 'react'`
    - To: `import { useState, useMemo, Suspense, Fragment } from 'react'`
    - _Bug_Condition: isBugCondition_2 — useSyncExternalStore in import list but never called_
    - _Preservation: All other imports remain; file compiles and renders without errors_
    - _Requirements: 2.2, 3.3_

  - [x] 3.3 Fix Bug 3 — Conflicting dark-mode classes on "Clear all" button (`app/page.tsx`)
    - Remove `dark:text-slate-500` (keep `dark:text-slate-400` as the intended resting colour)
    - Remove bare `dark:text-red-500` (keep `dark:hover:text-red-400` as the intended hover colour; the bare non-hover declaration conflicts)
    - _Bug_Condition: isBugCondition_3 — multiple dark:text-* utilities on same element targeting same CSS property_
    - _Preservation: Button click still clears all files; non-conflicting classes unchanged_
    - _Requirements: 2.3, 2.4, 3.4, 3.5_

  - [x] 3.4 Fix Bug 4 — Duplicate dark-mode utilities across remaining files
    - `components/ComparisonTable.tsx` — `thClass`: remove `dark:text-slate-500`, keep `dark:text-slate-400`
    - `components/ComparisonTable.tsx` — Server IPs no-data label cell: remove `dark:text-slate-500`, keep `dark:text-slate-600`
    - `app/details/page.tsx` — `SortIcon` inactive span: remove `dark:text-slate-500`, keep `dark:text-slate-600`
    - `app/details/page.tsx` — loading/empty state divs: remove `dark:text-slate-500`, keep `dark:text-slate-400`
    - `app/compare/page.tsx` — `SortIcon` inactive span: remove `dark:text-slate-500`, keep `dark:text-slate-600`
    - `app/compare/page.tsx` — all `—` placeholder spans: remove `dark:text-slate-500`, keep `dark:text-slate-600`
    - _Bug_Condition: isBugCondition_4 — any element with two or more dark: utilities targeting same CSS property_
    - _Preservation: Intentionally distinct Tailwind classes on other elements remain untouched_
    - _Requirements: 2.4, 3.5_

  - [x] 3.5 Fix Bug 5 — Memoize allEntries derivation (`app/details/page.tsx`, `app/compare/page.tsx`)
    - In both files, wrap the `flatMap` assignment in `useMemo` with `[store]` dependency
    - Change: `const allEntries = store?.analyses.flatMap((a) => a.entries) ?? [];`
    - To: `const allEntries = useMemo(() => store?.analyses.flatMap((a) => a.entries) ?? [], [store]);`
    - `useMemo` is already imported in both files — no new import needed
    - _Bug_Condition: isBugCondition_5 — allEntries recomputed on every render regardless of store change_
    - _Expected_Behavior: flatMap only re-executes when store reference changes_
    - _Preservation: allEntries returns same array reference when store has not changed (referential stability)_
    - _Requirements: 2.5, 3.6_

  - [x] 3.6 Fix Bug 6 — Deduplicate HarTimings type (`types/har.ts`)
    - Replace the anonymous inline type on `HarEntry.timings` with a reference to the existing `HarTimings` interface
    - Change the inline `timings: { send: number; wait: number; ... }` block to `timings: HarTimings`
    - Ensure `HarTimings` interface is declared before `HarEntry` in the file (move if needed; TypeScript hoists interfaces but convention is declaration-before-use)
    - _Bug_Condition: isBugCondition_6 — HarEntry.timings uses an anonymous inline type structurally identical to HarTimings but not referencing it_
    - _Preservation: HarEntry.timings continues to expose all fields (send, wait, receive, blocked?, dns?, connect?, ssl?)_
    - _Requirements: 2.6, 3.9_

  - [x] 3.7 Fix Bug 7 — formatBytes sentinel handling (`utils/harParser.ts`)
    - Replace `if (bytes <= 0) return '0 B'` with two separate guards:
      - `if (bytes < 0) return 'N/A';`
      - `if (bytes === 0) return '0 B';`
    - _Bug_Condition: isBugCondition_7(bytes) where bytes < 0_
    - _Expected_Behavior: formatBytes returns 'N/A' for any negative input (HAR sentinel)_
    - _Preservation: formatBytes(0) still returns '0 B'; formatBytes(positive) still returns correct human-readable string_
    - _Requirements: 2.7, 3.7, 3.8_

  - [x] 3.8 Fix Bug 8 — Search filter missing harFileName (`app/details/page.tsx`)
    - In the `filtered` memo inside `DetailsPageContent`, extend the search predicate to include `e.harFileName.toLowerCase().includes(q)`
    - Change: `String(e.status).includes(q)`
    - To: `String(e.status).includes(q) || e.harFileName.toLowerCase().includes(q)`
    - _Bug_Condition: isBugCondition_8(query, entry) — query matches harFileName but not url/contentType/status, so entry is wrongly excluded_
    - _Expected_Behavior: Entries matching harFileName are included in filtered results_
    - _Preservation: Filtering by url, contentType, and status still works; empty search shows all entries; URL group view (type=url) search logic unchanged_
    - _Requirements: 2.8, 3.10, 3.11, 3.12_

  - [x] 3.9 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Cell Zero-Value, formatBytes Sentinel, Search Filter harFileName
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - Run all three exploration tests from step 1 against the fixed code
    - **EXPECTED OUTCOME**: All PASS (confirms all three bugs are fixed)
    - _Requirements: 2.1, 2.7, 2.8_

  - [x] 3.10 Verify preservation tests still pass
    - **Property 2: Preservation** - Cell Non-Zero, formatBytes Non-Negative, Search Existing Fields
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run all preservation property tests from step 2 against the fixed code
    - **EXPECTED OUTCOME**: All PASS (confirms no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite and confirm all tests pass
  - Verify TypeScript compilation succeeds with no errors (`tsc --noEmit`)
  - If any test fails or a compilation error appears, resolve it before marking complete
  - Ask the user if questions arise
