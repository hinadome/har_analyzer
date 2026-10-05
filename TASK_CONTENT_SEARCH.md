# Content Search — Task Tracker

A new `/content-search` route that lets the user search free text across
every loaded HAR file's **response bodies** by `contains` / `exact` /
`regex`. It is the body-content counterpart to `/kv-search` (which
searches headers and cookies) — and fills the gap explicitly called out
as out-of-scope in `TASK_KV_SEARCH.md` ("Searching request/response
**body** content"). Each matching entry shows highlighted snippets of
the body around every match.

Boxes are checked as work lands.

## Decisions (locked)

- Route: **`app/content-search/page.tsx`**.
- No HAR-parser changes — response bodies are already captured at parse
  time and persisted under cold IndexedDB keys (`har_analyzer_body:{bodyId}`,
  store v2). The page loads them on demand; the engine is body-source
  agnostic (takes `{ entry, body }` pairs).
- **Reuse the kv-search matcher.** `utils/contentSearch.ts` imports
  `compileMatcher`, `KvSearchMode`, and `MatchRange` from
  `utils/kvSearch.ts`, so **contains / exact / regex** modes, the
  case-sensitive toggle, and the regex CPU budget (50 ms / 1000 matches
  per haystack) are shared verbatim — no second ReDoS guard to maintain.
- Single needle: **Body contains** (no name/value split — bodies are a
  single text field, unlike headers/cookies).
- **On-demand body loading.** Bodies are *not* eagerly loaded. Only
  entries that pass the optional `URL contains` pre-filter **and** report
  a captured body (`hasResponseBody === true`) are fetched, and only once
  a search needle is present. Loaded bodies are cached by `bodyId` so
  switching the needle / mode does not re-hit IndexedDB. A
  "Loading bodies…" indicator shows while a fetch is in flight.
- **Snippets, not full bodies.** The expanded panel shows a context
  window around each match (default 60 chars either side), with
  overlapping windows merged into one snippet and a per-entry snippet cap
  (default 20) so a match-dense body stays readable and bounded. Highlight
  ranges are rebased to snippet-local coordinates.
- URL pre-filter is a `contains`, case-insensitive entry pre-filter
  (matches the kv-search semantics). It composes as AND with the body
  needle and never drives results on its own — empty body needle = empty
  results, regardless of the URL filter.
- Only entries whose body survived the **Redact credentials before
  saving** privacy toggle are searchable (redaction omits bodies). The
  summary line surfaces `entriesWithoutBody` so this is visible.
- URL state on `/content-search`:
  `?text=…&url=…&mode=contains|exact|regex&cs=0|1&file=all|<index>&expand=<harFileIndex>:<indexInFile>`.
  Defaults are normalised out; `?expand=` capped at 512 chars via
  `parseExpandParam`.
- Discovery link: **Content search** pill in the home **Tools** row
  (`app/page.tsx`), next to **Search headers/cookies**. Visible whenever
  ≥ 1 file is loaded — a tool, not a problem detector, so no count badge.
- Zero new npm packages.

## Tasks

- [x] **Phase 1 — `utils/contentSearch.ts` + unit tests**
  - [x] Types: `ContentSearchMode` (re-export of `KvSearchMode`),
        `EntryBody`, `ContentSearchQuery`, `ContentSnippet`,
        `ContentSearchHit`, `ContentSearchSummary`, `ContentSearchError`,
        `ContentSearchOutcome`.
  - [x] `buildSnippets(body, ranges, context?, maxSnippets?)` — merges
        overlapping/touching match windows, rebases ranges to
        snippet-local coordinates, caps snippet count.
  - [x] `searchContent(records, query): ContentSearchOutcome` — compiles
        the needle via the shared `compileMatcher`, applies the URL
        pre-filter, skips (and counts) entries with no loaded body, runs
        the budgeted matcher over each body, aborts the whole run on a
        regex timeout, and computes the summary (hits, total matches,
        files touched, bodies searched, entries without body).
  - [x] `contentEntryId(entry, indexInFile)` URL helper.
  - [x] `__tests__/contentSearch.test.ts` (Vitest, node env): 16 specs —
        `searchContent` matching (6), body handling + URL pre-filter (4),
        `buildSnippets` (5), `contentEntryId` (1). All green.

- [x] **Phase 2 — `/content-search` page + panels**
  - [x] `components/content-search/types.ts` — `PageQuery`
        (`text`, `url`, `mode`, `caseSensitive`, `file`, `expand`).
  - [x] `components/content-search/ContentSearchPanels.tsx` —
        `PageTitle`, `SearchBar` (Body contains + URL contains inputs,
        Mode select, case checkbox, File select, "Loading bodies…"
        indicator, inline error), `SummaryLine` (hits / matches / scope /
        bodies searched / without-body count), `ResultsTable`
        (paginated, 50/page, `?expand=` deep-link + scroll-into-view),
        `ResultRow` + `ExpandedPanel` (snippet list), `Highlight`.
  - [x] `app/content-search/page.tsx` (`'use client'`) with `Suspense`
        wrapper and URL-driven state (`useSearchParams` / `usePathname` /
        `router.replace`, debounced 200 ms on the text inputs). Candidate
        selection + on-demand body cache (`bodyId` keyed) + search wired
        to `searchContent`.
  - [x] Page header / back-nav + empty / loading / `analyses.length === 0`
        fallback states consistent with `/kv-search`.

- [x] **Phase 3 — Navigation link**
  - [x] Add **Content search** pill to the home `Tools` row in
        `app/page.tsx`, after **Search headers/cookies**.
  - [x] **Follow-up (post-merge)** — pill relabelled **Search content**
        (verb-first, matching **Search headers/cookies**) and the Tools
        row reordered to: Performance overview · Pair diff · Entry diff ·
        Search content · Search headers/cookies · CORS · MIME mismatch ·
        Cache validator · Anomalies. Route (`/content-search`) and page
        title ("Content Search") unchanged. README §Usage step 3,
        spec.md §3.3, and CHANGELOG `[Unreleased]` synced.

- [x] **Phase 4 — Docs + verification**
  - [x] `README.md` — new feature bullet under "Features", new usage
        step (**Search response bodies**), and three directory-tree
        entries (`app/content-search/page.tsx`,
        `components/content-search/`, `utils/contentSearch.ts`).
  - [x] `CHANGELOG.md` — new `[Unreleased]` section above `[0.2.0]`
        with Added (page + engine + on-demand loading + UI + URL state +
        discovery link) and Tests.
  - [x] `TASK_CONTENT_SEARCH.md` — this tracker.
  - [x] `npx vitest run` — 25 / 25 suites, 351 / 351 tests green.
  - [x] `npm run build` — green; `/content-search` listed in the route
        table and prerendered as static content.

## Out of scope (for this round)

- Searching **request** bodies (POST payloads) — only response bodies
  are captured and persisted today.
- Pre-loading all bodies for an instant whole-corpus search — bodies are
  intentionally lazy to keep IndexedDB reads bounded.
- A "jump to the matched entry on the Content diff page" affordance —
  content search is per-entry; content diff compares two selected
  entries. (See the discussion note: a search hit does not imply two
  entries differ.)
- Match navigation (next/prev) within a single body or full-body inline
  rendering — the expanded panel shows capped snippets; the entry detail
  page (`/entry/[file]/[index]`) shows the full body.
- CSV / clipboard export of hits.
- Searching query-string parameters (that is a kv-search follow-up, not
  a body search).
