# Performance Pair-Mode Split — Task Tracker

Splitting the Pair-mode experience out of `/performance` into a dedicated
`/performance/diff` page, with each section redesigned around the
two-files-only mental model.

Boxes are checked as work lands.

## Decisions (locked)

- Route: **`app/performance/diff/page.tsx`** (not `/performance/compare`,
  to avoid collision with the existing per-URL `/compare`).
- Scope: **full pair-specific redesign** of every section — not a relocation.
- URL state: `?base=N&cmp=N&match=path|full&scale=log|linear`.
- The existing `/performance` page becomes **overview-only**: the mode toggle,
  baseline / compare dropdowns, and `RegressionsAndImprovements` section are
  removed; URL state simplifies to `?scale=log|linear`.
- "Only in Base" / "Only in Compare" lists carry per-URL stats
  (count, median time, median size) — not just bare URLs.
- Discovery: link from `app/page.tsx` and from `/performance` itself, greyed
  out until ≥ 2 HAR files are loaded.

## Tasks

- [x] **Phase 1 — Helper changes**
  - [x] Extend `RegressionResult` in `utils/perfStats.ts`:
    - [x] Replace `newUrls: string[]` with `onlyInCompare: UniqueUrlRow[]`.
    - [x] Replace `missingUrls: string[]` with `onlyInBase: UniqueUrlRow[]`.
    - [x] `UniqueUrlRow = { url, count, medianTime, medianSize }`.
  - [x] Update `computeRegressions` to populate the new shape, sorted by
        `medianTime` desc.
  - [x] Add `computeContentTypeDelta(baseEntries, cmpEntries)` returning
        rows of `{ contentType, base, cmp, delta }` per metric.
  - [x] Update `__tests__/perfStats.test.ts` for the new shape + new helper.

- [x] **Phase 2 — New page scaffolding (`app/performance/diff/page.tsx`)**
  - [x] `'use client'` + `Suspense` wrapper + URL-driven state
        (`useSearchParams` / `usePathname` / `router.replace`).
  - [x] Page header / back-nav consistent with `/performance`.
  - [x] Empty / loading / `< 2 files` fallback states.
  - [x] File picker bar: Base ▾, Compare ▾, **swap** button, Match toggle
        (`Path` / `Full URL`).

- [ ] **Phase 3 — Pair-specific sections**
  - [x] **§ KPI delta table** — rows = metrics, columns = Base / Cmp / Δ
        (red / green tint on Δ; bold % change).
  - [x] **§ Timing-phase comparison** — two stacked bars on a shared axis + per-phase Δ table beneath.
  - [x] **§ Response-time distribution** — 2-color overlaid histogram,
        linear / log toggle.
  - [x] **§ Regressions & Improvements** — as today, but with explicit
        `% change` column.
  - [x] **§ Only in Base / Only in Compare** — two side-by-side full
        listings with count / median time / median size, sortable.
        Rows link to `/file/{idx}?search=…` (URL exists in only one run).
    - [x] Teach `app/file/[index]/page.tsx` to seed its search box from a
          `?search=` URL param so the deep link auto-filters to the row.
  - [x] **§ Per content-type Δ** — rows = content types, columns =
        Base / Cmp / Δ for {count, bytes, avg, p95}.
  - [x] **§ Top deltas (Biggest movers)** — top 10 by `|Δtime|` and top 10
        by `|Δsize|`, replacing the global Slowest/Largest from overview.

- [x] **Phase 4 — Integration & cleanup**
  - [x] Strip Pair mode from `app/performance/page.tsx`:
    - [x] Remove `mode`, `base`, `cmp`, `match` from `PerfQuery`.
    - [x] Drop `ModeBar`'s pair branch (keep file color legend).
    - [x] Drop `RegressionsAndImprovements` import and section.
  - [x] Add **"Compare two runs →"** link in `/performance` legend bar
        (only shown when `analyses.length >= 2`).
  - [x] Add the same link in `app/page.tsx` next to the existing
        Performance Dashboard pill.

- [/] **Phase 5 — Verification**
  - [x] `npx vitest run` (all suites) — green (101/101).
  - [x] `npm run build` — green, `/performance/diff` listed in the route
        table.
  - [ ] Manual smoke test against `sample-hars/sample-{a,b,c}.har`.

## Out of scope (for this round)

- A 3+ file delta view (matrix of pairwise comparisons).
- Statistical significance markers on Δ values.
- CSV / clipboard export.
