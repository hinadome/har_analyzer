# HTTP Method Metric — Task Tracker

Add a new **HTTP Methods** section to the home-page `ComparisonTable`,
between Status Codes and Content Types. Each row shows the count per
file for a single HTTP method (`GET`, `POST`, `OPTIONS`, …) and links
to `/details?type=method&value=<METHOD>` for the filtered entry list.

Boxes are checked as work lands.

## Decisions (locked)

- **DetailType key**: `'method'` (camelCase consistent with `contentType`
  / `serverIPAddress` / `userAgent`). Not `'httpMethod'`.
- **Position**: directly after the Status Codes section and before
  Content Types. Methods are a higher-level request dimension closer
  in cardinality to status codes than to content types.
- **Color**: emerald (`text-emerald-600 dark:text-emerald-400` +
  hover variants). The remaining unused palette slot — blue, purple,
  orange, cyan, slate are already claimed by other rows.
- **Sort order**: canonical first
  (`GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, CONNECT, TRACE`),
  then any non-canonical methods alphabetically, then `(no method)`
  last. Matches DevTools / curl conventions.
- **Normalization**: methods uppercased before bucketing (`get` → `GET`).
  Empty / missing `request.method` buckets as `'(no method)'`, same
  sentinel style as `serverIPCounts`' `(no IP)`.
- **Backwards compatibility**: read sites use `a.methodCounts ?? {}`.
  Old IndexedDB analyses (pre-this-change) display `—` until the user
  re-uploads. No migration code.
- **Out of scope**:
  - Method column in the per-file entry list or `/details` flat table.
  - Method-keyed deep links from `/performance`, `/kv-search`, `/cors`.
- **Zero new npm packages.**

## Tasks

- [x] **Phase 1 — Types**
  - [x] `types/har.ts`: add
        `methodCounts: Record<string, number>` to `HarAnalysis`.
  - [x] `types/har.ts`: extend the `DetailType` union with `'method'`.

- [x] **Phase 2 — `utils/harParser.ts`**
  - [x] In `analyzeHar`, declare
        `const methodCounts: Record<string, number> = {};`
  - [x] Inside the entry loop:
        `const methodKey = method.toUpperCase() || '(no method)';`
        `methodCounts[methodKey] = (methodCounts[methodKey] || 0) + 1;`
  - [x] Return `methodCounts` on the `HarAnalysis` literal.
  - [x] Add `getAllMethods(analyses: HarAnalysis[]): string[]` that
        unions every `methodCounts` key, sorts by the canonical-then-
        alpha order above, and pins `'(no method)'` to the end.
  - [x] Update the two test-helper `HarAnalysis` literals in
        `__tests__/entryStats.test.ts` and
        `__tests__/corsAnalysis.test.ts` to include `methodCounts: {}`
        so `tsc` stays clean.

- [x] **Phase 3 — `components/ComparisonTable.tsx`**
  - [x] Import `getAllMethods` from `@/utils/harParser`.
  - [x] Compute `const allMethods = getAllMethods(analyses);` next to
        the other `getAll*` calls.
  - [x] After the Status Codes section block and before the Content
        Types section, insert a new section header row
        (`HTTP Methods`, `colSpan = analyses.length + 1`).
  - [x] Map `allMethods` → one row each: label is a `<Link>` to
        `/details?type=method&value={m}` in emerald with hover-underline
        and a font-mono medium label; data cells use
        `<Cell value={a.methodCounts?.[m]} />`.
  - [x] `(no method)` gets the same muted italic styling
        `(no IP)` uses on the Server IPs section.

- [x] **Phase 4 — `app/details/page.tsx`**
  - [x] Extend the filter `useMemo` with a new branch:
        `else if (type === 'method' && value) { ... }`
        — when `value === '(no method)'`, match
        `!(e.method ?? '').trim()`; otherwise match
        `e.method.toUpperCase() === value.toUpperCase()`.
  - [x] Extend the `title` ternary chain with a
        `type === 'method'` case → `HTTP Method: ${value}`
        (or `Requests with No HTTP Method` for `(no method)`).

- [x] **Phase 5 — Docs**
  - [x] `spec.md` §2.5 storage shape — add `methodCounts` row to the
        per-file aggregated counts list.
  - [x] `spec.md` §3.1 — extend the section list from
        "totals, status codes, content types, and content size"
        to include HTTP methods.
  - [x] `spec.md` §3.2 — add a new row to the Rows table.
  - [x] `spec.md` §3.3 — add "HTTP Methods" to the section-header list
        and document the canonical-order sort.
  - [x] `CHANGELOG.md` `[Unreleased]` / `Added` — bullet describing the
        new HTTP Methods section, the canonical sort, and the
        `/details?type=method` deep link.
  - [x] `README.md` Features and Usage — extend the Comparison Table
        bullet and step 2/3 to list HTTP methods.

- [x] **Phase 6 — `TASK_HTTP_METHOD.md`** (this file)
  - [x] Created with decisions + checklist.
  - [x] Tick boxes as each phase lands.

- [x] **Phase 7 — Verification**
  - [x] `npx tsc --noEmit` clean.
  - [x] `npx vitest run` — 210/210 green across all 8 suites.
  - [x] `npm run build` green with the route table unchanged
        (same 12 routes; only `ComparisonTable` and the `details`
        filter were touched).
