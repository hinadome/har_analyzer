# Header & Cookie Search — Task Tracker

A new `/kv-search` route that lets the user search across every loaded
HAR file's request/response headers and cookies by name, value, or
both, with `contains` / `exact` / `regex` match modes. Each matching
entry shows the underlying header/cookie pairs that caused the hit.

Boxes are checked as work lands.

## Decisions (locked)

- Route: **`app/kv-search/page.tsx`**.
- No HAR-parser changes — `EntryRecord.requestHeaders`,
  `responseHeaders`, `requestCookies`, `responseCookies` already
  carry every kv pair needed.
- Match modes: **`contains` + `exact` + `regex`**. Invalid regex shows
  a small inline warning instead of throwing.
- When both `name` and `value` are supplied: **same-pair AND** — the
  same header/cookie must satisfy both. (Empty input on either side
  is treated as a wildcard for that side.)
- Cookie names are matched **case-insensitively** by default (matches
  practical browser/server behaviour); the `cs` toggle controls value
  comparison for all four collections + name comparison when set.
- Response-cookie attributes (Path / Domain / Secure / HttpOnly /
  SameSite / Expires) are **out of scope** for this round
  (`EntryRecord.responseCookies` is currently `{ name; value }[]`).
- URL state on `/kv-search`:
  `?name=…&value=…&scope=rh,rc,sh,sc&mode=contains|exact|regex&cs=0|1&file=all|<index>&expand=<entryId>`.
- Discovery links:
  - Home page (`app/page.tsx`) — pill button next to the existing
    Performance / CORS pills; visible whenever ≥ 1 file is loaded
    (no count badge — this is a tool, not a problem detector).
  - Per-file page (`app/file/[index]/page.tsx`) — link next to the
    existing CORS Audit link, deep-linking to
    `/kv-search?file={index}`.
  - `/cors` handshake panel — every CORS header name in the
    Request / Response cards becomes a deep link to
    `/kv-search?name={header}` (scoped to that file when the page is
    file-scoped).
- Zero new npm packages.

## Tasks

- [x] **Phase 1 — `utils/kvSearch.ts` + unit tests**
  - [x] Types: `KvLocation`, `KvSearchMode`, `KvSearchQuery`,
        `MatchRange`, `KvMatch`, `KvSearchHit`, `KvSearchSummary`,
        `KvSearchError`, `KvSearchOutcome`.
  - [x] `compileMatcher(needle, mode, caseSensitive)` returns a
        discriminated `{ kind: "any" | "match" | "error" }`. The
        `match.run` function returns an array of `MatchRange`s or
        `null` for "no match", so the page can highlight matched
        spans directly.
  - [x] `searchEntries(entries, query): KvSearchOutcome` — applies
        the scope mask, runs the name + value matchers against each
        kv pair, enforces AND-within-pair when both sides are
        provided, computes the summary inline (per-location counts,
        total matches, files touched), and surfaces invalid-regex
        errors instead of throwing.
  - [x] URL helpers: `parseScopeParam` / `serializeScopeParam`
        (compact `rh,sh,rc,sc` form), `kvEntryId`.
  - [x] `__tests__/kvSearch.test.ts` (Vitest, node env): 30 specs —
        compileMatcher (6), scope mask + AND-within-pair (8), case
        sensitivity (4), exact / regex / invalid-regex mode (4),
        summary (1), scope-param helpers (6), basic semantics (1).
        All green; `npx tsc --noEmit` clean.

- [x] **Phase 2 — `/kv-search` page skeleton**
  - [x] Create `app/kv-search/page.tsx` (`'use client'`) with
        `Suspense` wrapper and URL-driven state (`useSearchParams` /
        `usePathname` / `router.replace`, debounced 150 ms on the
        text inputs).
  - [x] Page header / back-nav consistent with `/cors` and
        `/performance`.
  - [x] Empty / loading / `analyses.length === 0` fallback states.
  - [x] Search bar: `Name` + `Value` inputs, four scope chips
        (Req Headers / Req Cookies / Res Headers / Res Cookies) with
        `aria-pressed`, Mode `<select>` (contains / exact / regex),
        case-sensitive checkbox, File scope `<select>`.
  - [x] Summary line + per-location count breakdown.
  - [x] Results table — one row per matching entry. Columns: File ·
        Method · Status · URL · # matches · Timestamp. Row click
        toggles `?expand=<entryId>`.
  - [x] Empty / clean state: "Enter a name or value to search" (zero
        inputs), "No matches" (with active-filter sub-line).

- [x] **Phase 3 — expanded panel with match highlighting**
  - [x] Inline expand panel below clicked row: per-location grouped
        list of matched kv pairs (location chip color-coded —
        req-header blue, res-header indigo, req-cookie amber,
        res-cookie pink).
  - [x] `<Highlight />` helper renders matched name/value with
        `<mark>`-style spans backed by the ranges returned by
        `compileMatcher`.
  - [x] Deep-link support: when `?expand=<entryId>` is set on load,
        the matching row scrolls into view and is pre-expanded.

- [x] **Phase 4 — Navigation links**
  - [x] Add **Search Headers/Cookies** pill to `app/page.tsx`
        Comparison Summary button group, alongside Performance /
        Compare two runs / CORS Audit. Visible whenever
        `analyses.length >= 1`.
  - [x] Add **Search Headers/Cookies →** link in
        `app/file/[index]/page.tsx` next to the CORS Audit link.
        Always visible (every file has headers).
  - [x] `/cors` handshake panel — header names in Request / Response
        cards become deep links to `/kv-search?name=<header>` with
        `&scope=rh|sh&file=<index>` so the kv-search lands pre-scoped
        to the file and side.

- [x] **Phase 5 — Docs + verification**
  - [x] `README.md` — new feature bullet under "Features", new step
        under "How to use", new line in the directory tree for
        `utils/kvSearch.ts` and `app/kv-search/`.
  - [x] `spec.md` — new `§4.13 Header & Cookie Search page
(/kv-search)` describing URL state, match semantics, location
        chips, regex fallback; renumbered former `§4.13 Sorting` /
        `§4.14 Pagination` to `§4.14 / §4.15`; extended `§5`
        data-flow diagram with the kv-search branch.
  - [x] `CHANGELOG.md` — new `[Unreleased]` section above `[0.1.2]`
        with Added (page + utility + tests) and the three discovery
        links (home / per-file / `/cors`).
  - [x] `npx vitest run` — 7 / 7 suites, 182 / 182 tests green.
  - [x] `npm run build` — green; `/kv-search` listed in the route
        table alongside `/`, `/compare`, `/content-diff`, `/cors`,
        `/details`, `/file/[index]`, `/header-diff`, `/performance`,
        and `/performance/diff`.

- [x] **Phase 6 — URL filter follow-up**
  - **Decision** — URL filter is a `contains`, case-insensitive entry
    pre-filter (no `regex` / `exact` / case-sensitive variants).
    It composes as AND with name/value: entries are narrowed by
    URL first, then the kv matchers run over the survivors.
    URL alone is not a result driver — when both `name` and
    `value` are empty, the results table stays empty regardless
    of the URL filter (matches existing "no needle = no results"
    semantics).
  - [x] `utils/kvSearch.ts` — `KvSearchQuery.url?: string` added;
        `searchEntries` skips entries whose `url` does not contain
        the needle (case-insensitive) before running the kv matchers.
        No new error surface.
  - [x] `__tests__/kvSearch.test.ts` — 5 specs added under
        `searchEntries — url pre-filter`: substring narrowing,
        case-insensitive regardless of `caseSensitive`, URL-only with
        empty name/value still returns empty, empty URL = wildcard,
        composition with scope + case-sensitive name matcher.
  - [x] `app/kv-search/page.tsx` — full-width `URL contains` input
        added below Name / Value (debounced 150 ms), `?url=` wired
        through `PageQuery` and `buildQueryString`, SummaryLine now
        appends `· URL contains <needle>` when present, no-match hint
        suggests clearing the URL filter.
  - [x] `spec.md` §4.13 — `url` row added to the URL-state table,
        URL pre-filter bullet added to match-semantics, Search bar
        section text mentions the third input.
  - [x] `CHANGELOG.md` `[Unreleased]` — URL pre-filter and the bumped
        test count (35) documented under Added / Tests.
  - [x] `npx vitest run` + `npm run build` — green.

- [x] **Phase 7 — Results URL → header-diff deep link**
  - **Decision** — pure presentation change. The URL column in the
    results table and the full URL line in the expanded panel become
    `<Link>`s to `/header-diff?url=<encodeURIComponent(entry.url)>`.
    No engine changes, no new URL state on `/kv-search`, no new tests
    (no logic added). Row-click expand stays; the new link calls
    `e.stopPropagation()` to keep navigation clean.
  - [x] `app/kv-search/page.tsx` — `ResultRow` URL cell wraps
        `pathName` in a `<Link>` with `text-blue-600 dark:text-blue-400
hover:underline` styling and `onClick={(e) => e.stopPropagation()}`.
        `title={entry.url}` preserved on the `<td>`.
  - [x] `app/kv-search/page.tsx` — `ExpandedPanel` URL line wraps
        the full URL in the same `<Link>` (no stopPropagation — panel
        row has no click handler).
  - [x] `spec.md` §4.13 — Results table and Expanded panel rows in
        the Sections table both call out the deep link to
        `/header-diff?url=<entry.url>`.
  - [x] `CHANGELOG.md` `[Unreleased]` — new bullet under "Discovery
        links" describing the kv-search → header-diff hop.
  - [x] `npx tsc --noEmit` clean; `npx vitest run` 7/7 suites,
        187/187 tests green (unchanged); `npm run build` green,
        `/kv-search` and `/header-diff` both listed.

- [x] **Phase 8 — Row URL link retargeted to /compare**
  - **Decision** — the row-level URL link in `ResultRow` now points
    to `/compare?url=<entry.url>` (the per-URL summary page) for a
    quick scan-and-click jump. The expanded panel URL line stays on
    `/header-diff?url=<entry.url>` so once a hit is drilled into,
    the natural follow-up is the side-by-side header diff. Same
    `stopPropagation` + blue hover-underline styling preserved.
  - [x] `app/kv-search/page.tsx` — `ResultRow` URL cell `href`
        changed from `/header-diff` to `/compare`. No other
        attribute changes.
  - [x] `spec.md` §4.13 — Results table row updated to mention
        `/compare?url=<entry.url>`; Expanded panel row unchanged
        (still calls out `/header-diff`).
  - [x] `CHANGELOG.md` `[Unreleased]` — Discovery-links bullet
        split into two entries: row → `/compare`, expanded-panel →
        `/header-diff`.
  - [x] `npx tsc --noEmit` clean; `npx vitest run` 7/7 suites,
        187/187 tests green (unchanged); `npm run build` green.

- [x] **Phase 9 — Results column: Time → Timestamp (UTC)**
  - **Decision** — drop the right-aligned request-duration column
    (`formatTime(entry.time)`) and replace it with the same UTC
    timestamp shown on `/header-diff`'s entry list:
    `new Date(entry.startedDateTime).toLocaleString('en-US',
{ timeZone: 'UTC' }) + ' UTC'`, with `—` fallback when the
    field is missing. Pure presentation; no engine touch; column
    count stays at 7.
  - [x] `app/kv-search/page.tsx` — `ResultsTable` header label is
        now `Timestamp (UTC)`, left-aligned, `tabular-nums` dropped.
  - [x] `app/kv-search/page.tsx` — `ResultRow` cell renders the
        `startedDateTime` via the `/header-diff` formula with `—`
        fallback; left-aligned, `font-mono`, `whitespace-nowrap`.
  - [x] `app/kv-search/page.tsx` — `formatTime` import removed
        (it was the only call site on this page).
  - [x] `spec.md` §4.13 — Results table row updated: column list
        ends with `Timestamp (UTC)`; the cell formula and the
        match to `/header-diff` are called out.
  - [x] `CHANGELOG.md` `[Unreleased]` — new `### Changed`
        sub-section describing the Time → Timestamp (UTC) swap.
  - [x] `npx tsc --noEmit` clean; `npx vitest run` 7/7 suites,
        187/187 tests green (unchanged); `npm run build` green.

## Out of scope (for this round)

- Response-cookie attribute search (Path / Domain / Secure /
  HttpOnly / SameSite / Expires) — would require parser changes.
- Searching request/response **body** content (covered by content
  diff today).
- Searching query-string parameters.
- Saved searches / sharable named filters beyond the URL.
- CSV / clipboard export of hits.
