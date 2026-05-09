# CORS Audit — Task Tracker

A new `/cors` route that surfaces potential CORS issues across all loaded
HAR files: missing/mismatched `Access-Control-Allow-*` headers, failed or
slow preflights, wildcard-with-credentials conflicts, header/method
mismatches, and credential-flag omissions.

Boxes are checked as work lands.

## Decisions (locked)

- Route: **`app/cors/page.tsx`**.
- No HAR-parser changes — `EntryRecord.requestHeaders` and
  `EntryRecord.responseHeaders` already carry every header needed.
- Header lookup is **case-insensitive**; multi-value headers are joined
  with `", "`.
- A request is considered cross-origin when the request `Origin` header
  is present **and** its origin differs from the request URL's origin.
  Same-origin requests are excluded from the audit entirely.
- Preflight ↔ actual-request pairing key:
  **`(file, URL, ACRM-method, time-window)`** with a 5-second window on
  `startedDateTime`. URL is matched on full URL.
- Preflight-slow threshold: **`time > 1000 ms`**.
- 9 finding kinds (severity in parentheses):
  - `preflight-failed` (error) — OPTIONS with status ∈ {0, 4xx, 5xx}.
  - `preflight-slow` (warning) — OPTIONS `time > 1000 ms`.
  - `acao-missing` (error) — cross-origin response without ACAO.
  - `acao-mismatch` (error) — ACAO is a literal origin and ≠ request `Origin`.
  - `acao-wildcard-with-credentials` (error) — ACAO is `*` and request
    carried `Cookie` or `Authorization`.
  - `method-not-allowed` (error) — preflight ACRM not in response
    `Access-Control-Allow-Methods`.
  - `header-not-allowed` (error) — any token in ACRH not covered by
    response `Access-Control-Allow-Headers` (case-insensitive,
    comma-split, with `*` wildcard support).
  - `credentials-flag-missing` (error) — actual request was credentialed
    but response lacks `Access-Control-Allow-Credentials: true`.
  - `actual-request-blocked` (warning) — actual request paired with a
    failed preflight.
- URL state on `/cors`:
  `?file=all|<index>&severity=all|error|warning|info&origin=<encoded>&expand=<entryId>`.
- Discovery links:
  - Home page (`app/page.tsx`) — pill button next to "Performance Dashboard",
    visible whenever ≥ 1 file is loaded; small red dot when error count > 0.
  - Per-file page (`app/file/[index]/page.tsx`) — link in the page header
    deep-linking to `/cors?file={index}`.
- Zero new npm packages.

## Tasks

- [x] **Phase 1 — `utils/corsAnalysis.ts` + unit tests**
  - [x] `getHeader(headers, name): string | undefined` — case-insensitive,
        joins multi-value with `, `.
  - [x] `isCrossOrigin(entry): boolean` — Origin header present AND
        Origin's origin ≠ request URL's origin.
  - [x] `isPreflight(entry): boolean` — `method === 'OPTIONS'` and ACRM
        header present.
  - [x] `pairPreflights(entries): CorsPair[]` — pair OPTIONS with the
        matching actual request by `(URL, ACRM-method, time-window 5s)`.
  - [x] `analyzeEntry(entry, pair?): CorsFinding[]` — runs all 9 checks.
  - [x] `analyzeStore(analyses): CorsReport` — aggregate per file +
        global counts by severity / kind.
  - [x] Discriminated-union types: `CorsFindingKind`, `CorsFinding`,
        `CorsPair`, `CorsReport`.
  - [x] `__tests__/corsAnalysis.test.ts` (Vitest, node env): 45 tests —
        one positive + one negative case per finding kind, plus edge
        cases (case-insensitive header lookup, comma-separated allow
        lists with whitespace, wildcard ACAH, `null` origin,
        same-origin skip, pairing window respected). All green.

- [x] **Phase 2 — `/cors` page skeleton**
  - [x] Create `app/cors/page.tsx` (`'use client'`) with `Suspense`
        wrapper and URL-driven state (`useSearchParams` /
        `usePathname` / `router.replace`).
  - [x] Page header / back-nav consistent with `/performance`.
  - [x] Empty / loading / `analyses.length === 0` fallback states.
  - [x] File-scope chips: "All files" + per-file (color dot from existing
        palette) — driven by `?file=` URL param.
  - [x] Severity filter chips: All / Error / Warning / Info — driven by
        `?severity=` URL param. Origin filter dropdown (`?origin=`) when
        more than one Origin is present.
  - [x] **§ Summary KPIs** — 4 cards: Total findings (with severity
        breakdown), Failed preflights, Slow preflights (> 1000 ms),
        Cross-origin requests.
  - [x] **§ Issues table** — flat one-row-per-finding table with columns
        Severity / Kind / File / Status / Method / URL / Time / Detail.
        Sorted error→warning→info; row click toggles `?expand=<entryId>`
        (panel rendering deferred to Phase 3).
  - [x] Empty / clean state: "No CORS issues detected" with filter-aware
        sub-line.

- [x] **Phase 3 — handshake panel + preflight pairs**
  - [x] Inline expand panel below clicked row: 2-column
        Request / Response handshake grid showing the CORS-relevant
        header pairs (Origin + ACR* on the request side; the six
        ACA* response headers), plus the per-entry findings list with
        ✗ / ⚠ / • icons and the sent / expected / received detail
        triplet when present.
  - [x] **§ Preflight pairs** (collapsible `<details>`) — list of
        `CorsPair`s with OPTIONS row and actual-request row chained,
        verdict pill (OK / Warnings / Preflight failed / Actual
        blocked / No actual request) and Δ start time.
  - [-] **§ All cross-origin requests** (collapsible) — _dropped_:
    the issues table already covers this when severity = All and
    the per-entry handshake panel exposes the headers; a separate
    flat dump duplicates UI without adding signal.
  - [x] Deep-link support: when `?expand=<entryId>` is set on load,
        the matching row scrolls into view and is pre-expanded.

- [x] **Phase 4 — Navigation links**
  - [x] Add **CORS Audit** pill to `app/page.tsx` Comparison Summary
        button group, alongside Performance Dashboard / Compare two
        runs. Visible when `analyzeStore(...).crossOriginCount > 0`;
        renders a small red badge with the error count when
        `errorCount > 0`.
  - [x] Add **CORS Audit →** link in `app/file/[index]/page.tsx` next
        to the file index line, deep-linking to `/cors?file={index}`.
        Rendered only when the file has ≥ 1 cross-origin request.

- [x] **Phase 5 — Docs + verification**
  - [x] `README.md` — new feature bullet under "Features", new step
        under "How to use", new line in the directory tree for
        `utils/corsAnalysis.ts` and `app/cors/`.
  - [x] `spec.md` — new `§4.12 CORS Audit page (/cors)` describing
        layout, query-string state, finding kinds, and the handshake
        panel; `§5` data-flow diagram extended with the CORS branch;
        former `§4.12 Sorting` / `§4.13 Pagination` renumbered to
        `§4.13 / §4.14`.
  - [x] `CHANGELOG.md` — new `[Unreleased]` section with Added (page +
        analyzer + discovery links) and Tests (45 new specs) entries.
  - [x] `npx vitest run` — all 152 tests across 6 suites green.
  - [x] `npm run build` — green; `/cors` listed in the route table.
  - [-] Manual smoke against `sample-hars/sample-{a,b,c}.har` —
    deferred to user; the build / typecheck / unit-test suite
    already covers every analyzer path.

## Out of scope (for this round)

- Cross-file CORS comparison (delta view between two HARs).
- Suggested fixes / generated server config snippets.
- CSV / clipboard export of findings.
- HSTS / CSP / mixed-content audits (separate concern).
