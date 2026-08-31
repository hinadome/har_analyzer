# Changelog

## [0.2.0]

Major UI refresh and internal refactor. Analysis engines are unchanged; pages are thinner, storage scales better, and the home + CORS flows are clearer.

### Added

- **Shared page shell** — `AppHeader`, `PageShell`, `EmptyState`, and `LoadingState` used across all 11 routes; per-file color chips consolidated in `components/shared/fileColors.ts`.
- **Home insight strip** (`utils/homeInsights.ts`, `components/home/InsightStrip.tsx`) — cheap rollups (requests, errors, size, files) and optional pair deltas without walking entry arrays. Primary CTA: one file → `/file/0`; two or more → `/performance/diff`. Full comparison table collapsed behind **Full metrics table**; **Tools** row links to every analyzer route.
- **IndexedDB store v2** — hot blob (`har_analyzer_data`, version 2) holds entry metadata only; response bodies persist under `har_analyzer_body:{bodyId}` and load on demand via `useEntryBody` for `/entry`, compare Content tab, and content diff. Legacy single-blob stores migrate on read (re-upload if needed).
- **Upload progress UI** — file name (and size for multi-MB files) shown in the upload zone and loading state while parsing.
- **Optional Web Worker parse** (`workers/harParse.worker.ts`, `utils/parseHar.ts`) — feature-flagged for files ≥ 5 MB (`localStorage har_parse_worker=1` or `NEXT_PUBLIC_HAR_PARSE_WORKER=1`); main-thread fallback retained.
- **`/kv-search` pagination** — results capped at 50 rows per page with prev/next controls and deep-link page jump for `?expand=`.
- **Privacy controls** — dismissible first-visit banner (`components/home/PrivacyBanner.tsx`); opt-in **Redact credentials before saving** toggle (`utils/privacy.ts`, `components/home/RedactSecretsToggle.tsx`) masks `Authorization`, `Cookie` / `Set-Cookie`, and common token query params before IndexedDB save (off by default).
- **CORS request inventory** (`CorsRequestsTable` in `components/cors/CorsPanels.tsx`) — paginated table of every cross-origin and preflight entry (type, origin, ACAO, credentialed flag, findings count) with expandable handshake panels. When the audit is clean, this table is shown **above** the empty findings panel so `/cors` is useful even with zero issues.
- **Shared URL/path picker** — `components/shared/UrlPathPicker.tsx` + `hooks/useUrlPathSelection.ts` used by `/content-diff` and `/header-diff`.
- **Extracted route panels** — large JSX moved out of god pages into `components/compare/`, `components/content-diff/`, `components/cors/`, `components/kv-search/`, `components/performance/`, and `components/performance-diff/`.
- **`npm test`** script — runs `vitest run`.
- **Test hardening** — preservation/bug tests import real `ComparisonTableCell` and `filterEntriesBySearch`; RTL smokes for home, shell, kv-search, cors, perf-diff, and content-diff landmarks; `HeaderDiffView` layout tests. 250+ tests at time of release.

### Changed

- **Home CORS chip copy** — severity-aware: red **CORS audit — N errors**, amber **CORS — N warnings**, neutral **N cross-origin requests — all clear** (no longer amber-alert when clean). Tools link shows error/warning badges or a **clear** label.
- **`/cors` page title** — renamed from "CORS Audit" to **CORS**; subtitle describes audit + inventory. Clean-state findings panel points users to the request inventory below (or above when promoted).
- **`FileUpload`** — accepts optional `progressMessage` while parsing.
- **`app/details/page.tsx`** — search filter extracted to `utils/entrySearch.ts` (`filterEntriesBySearch`).
- **`DEPLOYMENT.md`** — 0.2.0 deploy guide: client-only architecture, pre-deploy `npm test`, worker chunks under `.next/static/`, `NEXT_PUBLIC_HAR_PARSE_WORKER` build arg, post-deploy smoke checklist (home insight, CORS inventory, privacy controls, content/header-diff pathname selection, header-diff 2×2 section layout).
- **`deploy-vm.sh`** — runs `npm test` before build; copies static assets to `.next/standalone/.next/static/` (matches Dockerfile); post-deploy smoke hints including content-diff; honours `NEXT_PUBLIC_HAR_PARSE_WORKER` at build time when exported.
- **`Dockerfile` / `docker-compose.yml`** — optional `NEXT_PUBLIC_HAR_PARSE_WORKER` build arg.
- **`spec.md`** — synced for 0.2.0: home insight strip / Tools row, IndexedDB v2, privacy + worker flags, CORS inventory page, kv-search pagination, `PageShell`, pathname-first content/header diff, updated data-flow and NFR sections.
- **Content Diff / Header Diff pathname selection** — default match is **pathname only** (not origin + path), so `/hello` on different hosts is one set. Query strings and fragments are ignored for grouping and entry matching; rows still **display** the full URL including query. Shared `UrlPathPicker` + `useUrlPathSelection`; banner **Selected path**; `?url=` deep links normalize via `pathKey()`. **Match full URL** remains the escape hatch (exact URL including query).

  Example: search `/hello` → selected path `/hello` → entries include both `https://diag-iron.dnslab.webtechnologists.net/hello` and `https://echo-server-eta-blue.vercel.app/hello` (and any `?query` variants of those paths).
- **Header Diff diff panel layout** — Request Headers, Response Headers, Request Cookies, and Response Cookies now use matching card shells in a **2×2 grid** (request vs response side by side on large screens). Each section has a consistent header (title + `empty` / `identical` / `N changes` badge), padded body, and fixed-column diff table; empty sections show **None** inside the card instead of unstyled text. Entry table column alignment matches Content Diff (centered Baseline/Compare radios, right-aligned count columns).

### Internal (no intentional behavior change)

- `REFACTOR_PLAN.md` — execution log for phases 0–5 (shell, page splits, home insight, store v2, worker, privacy, tests).
- Bodies stripped from hot IndexedDB blob on save; `EntryRecord` gains `hasResponseBody` and `bodyId`.

## [0.1.5]

### Added

- **HTTP Methods section in the home-page Comparison Table** — a new section between Status Codes and Content Types, with one row per distinct method (`GET`, `POST`, `OPTIONS`, …) across all loaded files. Methods are sorted in canonical order (`GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, CONNECT, TRACE`), then any non-canonical methods alphabetically, with `(no method)` pinned to the end of the section when present. Each row label links to `/details?type=method&value={method}` (emerald text + hover underline), opening the existing entry-list view filtered to that method.
  - Engine: `HarAnalysis.methodCounts: Record<string, number>` populated by `analyzeHar` (`entry.request.method` uppercased; empty bucketed as `(no method)`) and the new `getAllMethods(analyses)` helper in `utils/harParser.ts` for cross-file union + canonical ordering.
  - `DetailType` union extends with `'method'`; `app/details/page.tsx` gains a filter branch (case-insensitive match on `entry.method`, special-case `(no method)` for missing values) and a `HTTP Method: {value}` title.
  - Old IndexedDB analyses (pre-this-change) render `—` until the user re-uploads — read sites use `a.methodCounts ?? {}` so no migration is required.

## [0.1.4]

### Added

- **Single-entry detail page (`/entry/[file]/[index]`)** — deep-dive view for one specific HAR entry, identified by two zero-based dynamic segments (`[file]` = `harFileIndex`, `[index]` = position in that file's `analysis.entries`). No query-string state.
  - Pure helpers in `utils/entryStats.ts`: `getEntryByPosition` (bounds-checked store → entry lookup), `compareEntryToFile` (ranks `time` against the file's P50/P95/P99 and `contentSize` against the median/P90 — emits `timeRank` ∈ {`faster-than-p50`, `between-p50-p95`, `slower-than-p95`, `slower-than-p99`} and `sizeRank` ∈ {`below-median`, `above-median`, `top-decile`}), `parseUrlQuery` (URL-decoded `{name,value}[]` parser), `findHeader` (case-insensitive lookup), `findIndexInFile` (back-link entry → array index), `throughputKBps`, `reusedConnection` (keep-alive heuristic — `true` when both `timings.dns` and `timings.connect` normalize to `0`, i.e. the browser's HAR `-1` "N/A" sentinel on both phases; `ssl` is intentionally excluded because TLS resumption varies independently of socket reuse).
  - Page sections in order: title block (method · status badge · URL · file/index · UTC timestamp), summary card (time · size · content type · throughput · connection-reuse hint), performance card (stacked timing bar + phase grid + `Blocked` row + context strip ranking against the file with tinted chips driven by `timeRank` / `sizeRank` + derived hints), request card (Headers / Cookies / Query string with sortable a–z header table), response card (Headers / Cookies / `Set-Cookie (raw)` preserving `Path` / `HttpOnly` / `Max-Age` / `SameSite` attributes), content card (`<pre>` body capped at 50 000 chars with `Show full` ↔ `Show truncated` toggle and a copy-to-clipboard button on the full body; binary and no-body fallbacks via `isBinaryEntry`).
  - Fallback matrix: loading state from `useHarStore`; "No HAR loaded" when the store is empty; "Entry not found" when segments are non-numeric / out of range; context strip hidden when the file has fewer than two entries.
- **Shared timing-phase color/label module** — `components/timingPhases.ts` centralises the `TIMING_PHASES` constant (DNS · Connect · SSL · Send · TTFB · Receive with their Tailwind bar / dot / text utilities). `/compare`, `/performance`, `/performance/diff`, `/file/[index]`, and the new `/entry/[file]/[index]` now consume this single source instead of carrying three slightly-drifted copies.
- **Discovery links** for the new entry page:
  - `app/file/[index]/page.tsx` — the main paginated entry-list URL cell is now a `<Link>` to `/entry/{harFileIndex}/{indexInFile}` (the top-10 slowest/largest summary tables keep their cross-file `/compare?url=…` link). `indexInFile` resolved via an in-component `Map<EntryRecord, number>`.
  - `app/compare/page.tsx` — every expanded per-entry header row in `PerFileRow` carries a `Detail →` link to `/entry/{harFileIndex}/{indexInFile}` with `stopPropagation` so it doesn't toggle the expand panel.
  - `app/cors/page.tsx` — three new outbound deep links to `/entry/{fileIndex}/{entryIndex}`, all resolving via `CorsEntry.fileIndex` + `CorsEntry.entryIndex` already carried on the audit data: (1) the issues table URL cell in `IssueRowView` wraps in a `<Link>` (with `stopPropagation` so it doesn't toggle the row's expand), (2) `HandshakePanel` renders an **Open entry detail →** affordance in a right-aligned strip above the request / response grid, and (3) `PairRowLine` accepts an optional `href` prop and renders the URL cell as a `<Link>` when provided — `PairCard` passes the entry route for the OPTIONS row always and for the Actual row only when `pair.actual !== null`.
- **Tests** — 23 new specs in `__tests__/entryStats.test.ts` covering all seven helpers (bounds checks, percentile-rank thresholds at P50/P95/P99 and median/P90, URL query parsing including empty/repeated/malformed inputs, header lookup case-insensitivity, throughput edge cases, and the keep-alive heuristic).

### Changed

- `/kv-search` expanded panel — the full URL anchor now deep-links to `/entry/<harFileIndex>/<indexInFile>` (was `/header-diff?url=<encoded>`) so the "drill deeper" hop lands on the specific matching entry rather than every entry sharing the URL. `indexInFile` is threaded from `ResultsTable` (already computed alongside `kvEntryId`) through `ResultRow` → `ExpandedPanel` as a new prop. The compact-row URL cell's `/compare?url=…` link is unchanged.

## [0.1.3]

### Added

- **Header & Cookie Search page (`/kv-search`)** — new triage page for finding specific headers or cookies across every loaded HAR file:
  - Pure search engine in `utils/kvSearch.ts` (`compileMatcher`, `searchEntries`, plus `parseScopeParam` / `serializeScopeParam` / `kvEntryId` URL helpers) supporting three match modes (`contains`, `exact`, `regex`) with optional case sensitivity. Invalid regex patterns are surfaced as inline warnings via a discriminated `KvSearchError` instead of throwing.
  - **Same-pair AND** semantics: when both `name` and `value` are supplied, both needles must match the same header/cookie entry (not just somewhere in the same HTTP request). Empty input on either side is treated as a wildcard for that side.
  - Per-needle highlight ranges (`MatchRange[]`) returned from the matcher, used by the expanded panel to wrap matched substrings in `<mark>`.
  - `/kv-search` page wires the engine into a URL-driven UI: `Name` + `Value` inputs and a full-width `URL contains` pre-filter (all three debounced 150 ms), four `aria-pressed` scope chips (req header / res header / req cookie / res cookie, color-coded blue / indigo / amber / pink), Mode `<select>`, case-sensitive checkbox, File scope `<select>` (shown when ≥ 2 files loaded). Empty / no-match / regex-error fallback states.
  - Results table: one row per matching entry with file color, method, status, URL, match count, and time. Click-to-expand reveals a per-pair list with the matching name / value spans highlighted and a colored location chip.
  - **URL pre-filter** — optional `?url=` needle that narrows entries to those whose URL contains the substring (always case-insensitive, independent from `mode` / `cs`). Composes as AND with `name` / `value`; never produces results on its own when both name and value are empty. The summary line surfaces the active URL needle.
  - URL state: `?name=&value=&url=&scope=rh,sh,rc,sc&mode=contains|exact|regex&cs=0|1&file=all|<index>&expand=<harFileIndex>:<indexInFile>` — defaults are normalised out (e.g. all-four-scope chips collapse to no `scope` param). `?expand=` deep-links to a specific row and scrolls it into view on load.
- **Discovery links** for the new search page:
  - Home page (`app/page.tsx`) — **Search Headers/Cookies** pill added to the Comparison Summary button group; visible whenever ≥ 1 file is loaded.
  - Per-file page (`app/file/[index]/page.tsx`) — **Search Headers/Cookies →** link added next to the file index, deep-linking to `/kv-search?file={index}`.
  - `/cors` handshake panel (`app/cors/page.tsx`) — every CORS header name in the Request / Response cards is now a link to `/kv-search?name=<header>&scope=rh|sh&file=<index>` so audit findings can be jumped into the search page pre-scoped to the relevant file and side.
  - `/kv-search` row-level deep link — the URL column in the results table is a blue link to `/compare?url=<entry.url>` (the per-URL summary page), so a kv-search hit can be opened in the broader per-URL view in one click. The row click still toggles the expanded panel; the link uses `stopPropagation` to navigate cleanly.
  - `/kv-search` expanded-panel deep link — the full URL line inside the expanded panel is a blue link to `/header-diff?url=<entry.url>`, taking the user straight into a side-by-side header diff for that URL once they've drilled into a specific hit.

### Changed

- `/kv-search` results table — the **Time** column (request duration in ms via `formatTime(entry.time)`) is replaced by **Timestamp (UTC)**, formatted exactly the way `/header-diff`'s entry list renders it: `new Date(entry.startedDateTime).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC'`, with `—` when the field is missing. Column count and layout otherwise unchanged.

### Tests

- Added 35 tests in `__tests__/kvSearch.test.ts` — `compileMatcher` (6), scope mask + AND-within-pair (8), case sensitivity (4), exact / regex / invalid-regex modes (4), summary (1), scope-param URL helpers (6), basic semantics (1), URL pre-filter (5: substring narrowing, case-insensitive regardless of `cs`, URL-only returns empty without name/value, empty URL = wildcard, composition with scope / case / name matcher). All suites green; `npx tsc --noEmit` clean.

## [0.1.2]

### Added

- **CORS Audit page (`/cors`)** — new diagnostic dashboard that flags potential Cross-Origin Resource Sharing problems across every loaded HAR file:
  - Pure analyzer in `utils/corsAnalysis.ts` (`analyzeStore`, `pairPreflights`, `analyzeEntry`) detects nine finding kinds — `preflight-failed`, `preflight-slow` (> 1000 ms), `acao-missing`, `acao-mismatch`, `acao-wildcard-with-credentials`, `method-not-allowed`, `header-not-allowed`, `credentials-flag-missing`, `actual-request-blocked` — with case-insensitive header lookup, comma-separated allow-list parsing, and `null` / wildcard origin handling
  - Preflight-to-actual pairing by `(URL, ACRM-method, time-window)` within `PREFLIGHT_PAIR_WINDOW_MS = 5000` ms; each actual request is consumed by at most one preflight
  - `/cors` page wires the analyzer into a 4-card KPI summary (Total findings, Failed preflights, Slow preflights, Cross-origin requests), a flat issues table sorted error → warning → info, and a click-to-expand Handshake panel showing the request / response CORS headers side-by-side plus the per-finding sent / expected / received detail triplet
  - Collapsible "Preflight pairs" section chains every OPTIONS request to its matching actual request with a single-pill verdict (OK / Warnings / Preflight failed / Actual blocked / No actual request) and Δ start time
  - URL-driven filter state: `?file=`, `?severity=`, `?origin=`, `?expand=<fileIndex>:<entryIndex>` — `expand` deep-links to a specific entry and scrolls it into view on load
- **Discovery links** — home page (`app/page.tsx`) renders a **CORS Audit** pill in the Comparison Summary button group when at least one cross-origin request is captured, with a red error-count badge when `errorCount > 0`. Per-file page (`app/file/[index]/page.tsx`) renders a **CORS Audit →** link next to the file index when that file has any cross-origin entries, deep-linking to `/cors?file={index}`.

### Tests

- Added 45 tests in `__tests__/corsAnalysis.test.ts` — one positive + one negative case per finding kind, plus edge cases (case-insensitive header lookup, comma-separated allow lists with whitespace, wildcard `ACAH`, `null` origin, same-origin skip, pairing window respected). All 152 suites green.

## [0.1.1]

### Changed

- **Content Diff binary fallback now compares by SHA-256 hash** — previously, when at least one of the two selected entries had a binary content type or no captured response body, the fallback panel only displayed byte sizes, leaving users with no way to tell whether two binary responses were equal. The panel now asynchronously computes the SHA-256 hash of each side's stored `responseContent` (via the Web Crypto API, `crypto.subtle.digest("SHA-256", …)`) and renders both 64-character hex digests side-by-side along with the byte sizes. A status banner reports the comparison result:
  - **Identical (matching SHA-256)** — both hashes equal
  - **Different (SHA-256 mismatch)** — hashes differ
  - **Computing SHA-256…** — digest is in flight
  - **No body captured for {baseline | compare | either entry}** — `responseContent` is missing on at least one side (common for binary bodies in many HAR exporters)
  - **Hash error: …** — `crypto.subtle` is unavailable (e.g. non-secure dev context)

### Added

- **`sha256Hex(text: string): Promise<string>`** in `utils/contentDiff.ts` — UTF-8-encodes the input, runs it through `crypto.subtle.digest("SHA-256", …)`, and returns a lowercase hex digest. Throws when the Web Crypto API is unavailable. Used by the binary fallback panel; reusable elsewhere.

### Tests

- Added 6 tests in `__tests__/contentDiff.test.ts` covering `sha256Hex`: NIST canonical vectors for the empty string and `"abc"`, hex-format shape (`/^[0-9a-f]{64}$/`), equality of equal inputs, inequality of different inputs, and large-input correctness.

### Added

- **Cross-file performance dashboard (`/performance`)** — overview page laying every loaded HAR file out side by side:
  - Per-file KPI matrix (total requests, P50/P95/P99 response time, total bytes, error rate) rendered as horizontal bars on a shared per-metric scale so visual length is directly comparable across files
  - Average timing-phase comparison (DNS, Connect, SSL, Send, TTFB, Receive) on a shared millisecond axis
  - Response-time distribution histogram with a shared bucket axis (linear / log toggle) so each file's request-count-per-bucket can be eyeballed against the others
  - Per-content-type performance table (count, total bytes, avg time, p95 time) grouped by file
  - Combined Slowest / Largest top-N lists across all files with file color chips and deep links to the per-file view filtered to the URL
  - File color legend that doubles as a discovery surface for the pair-diff dashboard once ≥ 2 files are loaded
- **Pair diff dashboard (`/performance/diff`)** — dedicated head-to-head comparison page for any two loaded files. Sections:
  - Headline KPI Δ cards with absolute delta + % change and tinted regression/improvement cues (`deltaTone` semantics: lower-is-better for time/bytes/errors)
  - Per-phase timing Δ chart on a shared axis (Base in baseline color, Compare in compare color, Δ labelled per phase)
  - Overlaid 2-color response-time distribution histogram with shared buckets and a linear / log scale toggle
  - Per-content-type Δ table with grouped headers (Count · Bytes · Avg time · p95 time, each split into Base / Cmp / Δ), sortable columns, default sort by `|Δavg time|` desc
  - Biggest Movers — top 10 by `|Δtime|` and top 10 by `|Δsize|`, drawn from URLs present in both runs
  - Top 10 Regressions and top 10 Improvements (one-directional, time-based) with per-URL median, signed Δ, and % change
  - "Only in Base" and "Only in Compare" unique-URL listings, each row deep-linking into the per-file view filtered to that URL
  - Path-mode / Full-URL match-key toggle persisted in the query string alongside `base`, `cmp`, and `scale`
- **"Compare two runs →" discovery links** — added to the home page and the cross-file performance dashboard (visible only when ≥ 2 files are loaded), navigating to `/performance/diff`
- **Per-file view URL search seeding** — `app/file/[index]/page.tsx` now accepts a `?search=` query parameter and pre-populates its filter input with that value, enabling deep links from the diff dashboard's unique-URL lists
- **Performance helper utilities (`utils/perfStats.ts`, `utils/perfFormat.ts`)** — shared math and formatting layer used by both performance pages: percentile/median, timing-phase averages, shared-bucket histogram, content-type aggregation, regressions/improvements, content-type Δ, plus `formatDelta`, `formatPctChange`, and `deltaTone`
- **Sample HAR fixtures (`sample-hars/sample-a.har`, `sample-b.har`, `sample-c.har`)** — small fixture set used for manual verification of the pair diff flows

### Changed

- **`next` upgraded to `^16.2.5`** (from `^16.2.4`) — minor patch bump
- **`next.config.ts`** — added `127.50.100.1` to `allowedDevOrigins` for local development from a non-loopback address
- **`README.md`** — new feature bullets and usage steps for the cross-file dashboard and pair diff dashboard, expanded directory-tree section listing `app/performance/`, `utils/perfStats.ts`, and `utils/perfFormat.ts`
- **`spec.md`** — added §4.10 (Cross-file Dashboard) and §4.11 (Pair Diff Dashboard) describing layout, query-string state, and computed metrics; pipe characters inside backtick'd table cells escaped (`\|`) so GFM tables render correctly
- **`DEPLOYMENT.md`** — step list now states the Next.js 16 minimum Node version (20.9+), the standalone-asset copy step, and the env-var-based PM2 invocation

### Fixed

- **`deploy-vm.sh` broken standalone deployment** — the script ran `npm run build` and started PM2 against `.next/standalone/server.js` without copying `public/` and `.next/static/` into `.next/standalone/`, which would have caused 404s for every JS chunk and every `public/` asset in production. Both first-time and `--update` paths now run `cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/` after the build, matching the Next.js 16 standalone docs and the existing `Dockerfile` behaviour.
- **`deploy-vm.sh` PORT/HOSTNAME ignored by the standalone server** — the standalone `server.js` reads `process.env.PORT` and `process.env.HOSTNAME`, not argv, so the previous `pm2 start … -- --port "$PORT"` form was silently dropped (only working because `3000` is the default). The script now exports `NODE_ENV=production PORT="$PORT" HOSTNAME=0.0.0.0` before invoking `pm2 start`, and `pm2 restart` in `--update` mode now passes `--update-env` so env changes propagate on redeploy.

### Tests

- Added `__tests__/perfStats.test.ts` covering percentile, median, timing-phase average, histogram bucket assignment, content-type aggregation, regressions/improvements, and content-type Δ helpers
- Added `__tests__/perfFormat.test.ts` covering `formatDelta`, `formatPctChange`, and `deltaTone` semantics for lower-is-better, higher-is-better, and neutral metrics

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
