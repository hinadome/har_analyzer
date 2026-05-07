# Performance Dashboard — Task Tracker

A new `/performance` route that surfaces cross-HAR performance comparison.
Boxes are checked as work lands.

## Decisions (locked)

- Histogram scale: **combined-range log-spaced buckets** (10 bins) computed
  once over the union of all selected files, so every file is binned against
  the same axis. UI exposes a **log / linear** toggle.
- URL match key for regressions: **path-only by default** (uses
  `stripQuery` from `utils/contentDiff.ts`), with a UI toggle for full URL.
- Error rate: counts `status >= 400` **and** `status === 0` (network failure).
- Dependencies: **zero new packages**. Pure Tailwind for all visualizations.

## Tasks

- [x] **Phase 1 — Foundation**
  - [x] Create `utils/perfStats.ts` with pure helpers:
    - [x] `normalizeTiming(v)` — maps HAR `-1` sentinel and `undefined` to `0`.
    - [x] `isErrorStatus(code)` — `code >= 400 || code === 0`.
    - [x] `computePerfStats(entries)` — totals, bytes, error %, P50/P75/P95/P99,
          avg, slowest single, wall-clock span.
    - [x] `computeTimingAvgs(entries)` — avg per phase + total.
    - [x] `computeHistogram(filesEntries[], { scale, bins })` — single shared
          axis across all files; returns bucket edges + per-file counts.
    - [x] `computeRegressions(baseEntries, cmpEntries, { matchKey })` — Δtime
          rankings + new/missing URL sets; `matchKey: 'path' | 'full'`.
    - [x] `computeContentTypePerf(entries)` — per content-type aggregate.
  - [x] Add `__tests__/perfStats.test.ts` (Vitest, node env): percentiles,
        bucket edge math (log + linear), shared-axis bucketing, regression
        matching with both keys, error-rate-includes-zero, empty/edge cases.
  - [x] `npx vitest run __tests__/perfStats.test.ts` is green (22 tests).

- [x] **Phase 2 — Page scaffolding**
  - [x] Create `app/performance/page.tsx` (`'use client'`) with `Suspense`
        wrapper and `useSearchParams`-driven URL state
        (`?mode=overview|pair&base=N&cmp=N&match=path|full&scale=log|linear`).
  - [x] Header / back-nav matching `app/file/[index]/page.tsx`.
  - [x] Empty / loading / single-file fallback states.
  - [x] Mode toggle: `Overview` (all files) ↔ `Pair` (baseline + compare).

- [x] **Phase 3 — Sections**
  - [x] **§ Per-file KPI matrix** — files as columns, KPI rows. Cells reuse
        `formatBytes` / `formatTime` styling.
  - [x] **§ Avg timing-phase comparison** — one stacked bar per file using the
        same `TIMING_PHASES` palette already used in `app/compare/page.tsx`.
  - [x] **§ Response-time distribution histogram**
    - [x] Combined-range log-spaced bucket edges.
    - [x] Per-file overlaid bars (all visible at once).
    - [x] Log / Linear toggle.
  - [x] **§ Regressions & improvements** (pair mode only)
    - [x] URL match toggle (`path` default, `full`).
    - [x] Top 10 regressions + top 10 improvements by Δtime, links to
          `/compare?url=…`.
    - [x] "New in compare" / "Missing in compare" URL counts.
  - [x] **§ Per content-type performance** — rows = content types, columns =
        files × {avg time, p95 time, total bytes, count}.
  - [x] **§ Combined slowest / largest top-10** — across all files, each row
        tagged with file name.

- [x] **Phase 4 — Integration**
  - [x] Refactor `app/file/[index]/page.tsx` to consume `utils/perfStats.ts`
        (now uses `computePerfStats` / `computeTimingAvgs`; error rate now also
        counts `status === 0` per locked decision).
  - [x] Add a `/performance` discovery link in `app/page.tsx` near
        "Comparison Summary".

- [x] **Phase 5 — Verification**
  - [x] `npx vitest run` (all suites) — green (78 tests).
  - [x] `npm run build` — green, no type errors. `/performance` listed in
        the static route table.
  - [ ] Manual smoke test against `sample-hars/sample-{a,b,c}.har`.
