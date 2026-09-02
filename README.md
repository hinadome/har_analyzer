# HAR Analyzer

A browser-based tool for uploading, analyzing, and comparing multiple HAR (HTTP Archive) files side by side. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- Upload multiple `.har` files via drag-and-drop or file browser, with per-file parse progress during upload
- **Home insight strip** — after upload, the first viewport answers "what should I look at?" with request/error/size totals, optional pair deltas when two files are loaded, and a primary CTA to open file performance or pair diff
- Comparison table (collapsible behind "Full metrics table") showing request counts, status codes, HTTP methods, unique URLs, content types, content size totals, and content size distribution per file
- Clickable status codes, HTTP methods, URLs, content types, and content size ranges that link to detailed breakdowns
- Details pages with sortable, filterable, paginated entry tables
- URL details grouped by endpoint with per-file hit counts and expandable rows
- Per-file performance dashboard: P50/P95/P99 response times, slowest requests, largest resources, and avg timing breakdown (DNS → Connect → SSL → Send → TTFB → Receive)
- **Cross-file performance dashboard** (`/performance`) — every loaded file laid out side by side: per-file KPI matrix on shared bar scales, average timing-phase comparison, response-time distribution histogram with shared bucket axis, per-content-type performance table, and combined Slowest/Largest top-N lists
- **Pair diff dashboard** (`/performance/diff`) — pick a baseline and a compare file to see headline KPI Δs (with % change and tinted regression/improvement cues), per-phase timing deltas, an overlaid 2-color histogram, per-content-type Δ table, biggest movers by |Δtime| and |Δsize|, top-10 regressions and improvements, and "Only in Base" / "Only in Compare" unique-URL listings that deep-link into the per-file view filtered to that URL
- Per-URL comparison page showing each HAR file's entries side-by-side with expandable request detail including **Request headers**, **Response headers**, **Cookies**, **Timing**, and **Content** tabs
- Per-request timing breakdown: stacked bar chart and phase grid (DNS, Connect, SSL, Send, TTFB, Receive) shown when expanding any individual request
- **Entry diff** (`/entry-diff`) — one pathname picker and entry table; compare any two entries on **Headers | Content** tabs (status chips on each tab). Headers: 2×2 card grid for request/response headers and cookies. Content: line-by-line body diff with **no body** / **binary** badges and lazy body load on the Content tab only. Legacy `/content-diff` and `/header-diff` redirect here with `?section=`.
- **MIME mismatch** (`/mime-mismatch`) — lists entries whose URL pathname extension does not match effective response Content-Type (e.g. `.json` with `text/html`). Tools link shows mismatch count or **clear**; insight strip card when mismatches exist. Unknown extensions hidden by default; **Show unverified extensions** toggle for paths with no built-in MIME map.
- **Cache validator** (`/cache-validator`) — same pathname (query ignored) with different **ETag** or **Last-Modified** across entries. Tools link shows path-count badge or **clear**; insight strip when drift exists. Weak ETags (`W/`) are distinct from strong — **W** (dashed violet) vs **S** (solid) chips. Expand path groups to see every entry; **Entry diff →** deep link. Optional **Show paths with no cache validators** toggle.
- **Anomalies hub** (`/anomalies`) — one Tools entry for pathname-level inconsistencies: **status**, **size drift**, **encoding**, and **cache policy** (`Cache-Control` / `Vary`). Hub cards link to `/anomalies/status`, `/anomalies/size`, `/anomalies/encoding`, and `/anomalies/cache-policy`. Badge = unique paths with any anomaly (or **clear**). Insight strip when anomalies exist; hub highlights paths flagged by multiple checks. Related links to MIME mismatch, cache validator, and CORS.
- **Content-Type resolution** — Chrome/NetLog HARs often set `response.content.mimeType` to `x-unknown` while the `Content-Type` header is correct (e.g. `text/javascript; charset=utf-8`). The app stores both, uses the header for **effective** type in Content Types counts and filters, and shows an amber split on entry detail when they disagree (`HAR content.mimeType` vs response header). List tables show a **from header** or **≠ HAR** chip when sources differ.
- **Header & Cookie Search page** (`/kv-search`) — free-text search over every header and cookie carried by the loaded HARs. Three needles (Name / Value / URL contains) with `contains` / `exact` / `regex` modes (regex has a CPU budget — overly broad patterns show a timeout warning), case-sensitive toggle, four scope chips (req header / res header / req cookie / res cookie), and a file scope. Same-pair AND semantics; paginated results table (50 rows per page) with click-to-expand highlighted match spans; the URL cell deep-links to `/compare`, and the expanded full URL deep-links to `/entry/[file]/[index]`
- **CORS page** (`/cors`) — audit **and inventory** for every cross-origin request in the loaded HARs. Detects nine finding kinds (failed/slow preflights, missing or mismatched `Access-Control-Allow-Origin`, wildcard ACAO with credentials, disallowed method, disallowed request header, missing `Access-Control-Allow-Credentials` flag, blocked actual request). Uses `Sec-Fetch-Mode` when present so `no-cors` / navigations are not flagged as CORS errors; missing ACAO without `cors` mode is advisory (**info**). Credentialed = Cookie only (not Authorization alone). KPI cards summarize totals, failed/slow preflights, and cross-origin counts; the issues table is filterable by file, severity, and Origin; when no issues are found, a **CORS requests** table still lists every cross-origin and preflight entry (origin, ACAO, credentialed flag, per-row findings) with expandable handshake panels. A collapsible "Preflight pairs" section chains every OPTIONS request to its matching actual request within a 5 s window
- **Single-entry detail page** (`/entry/[file]/[index]`) — deep dive into one specific request: title block with method / status / URL; performance card with stacked timing bar, phase grid, and a context strip ranking this entry's time and content size against the file's P50 / P95 / P99 and size distribution; Request, Response, and Content cards exposing headers (sortable a–z), parsed cookies, parsed query string, raw `Set-Cookie` values, and the response body (loaded on demand from IndexedDB; capped at 50 000 chars with "Show full" toggle + copy-to-clipboard). Content-Type summary shows effective type and, when HAR `content.mimeType` disagrees with the response header, an amber split (`x-unknown` in Chrome exports is common). Content card distinguishes **binary MIME** (body not displayed) from **no captured body text** (may still show wire size when `content.size` > 0). Linked from the per-file entry list URL cell, the `/compare` per-entry expand-panel header, the `/kv-search` expanded panel, and three sites on `/cors` (issues table URL cell, handshake panel "Open entry detail →" affordance, and the preflight-pair OPTIONS / Actual URL rows)
- **Privacy controls** — dismissible banner on first visit explaining that HARs may contain credentials and data stays in this browser's IndexedDB; optional **Redact credentials before saving** toggle masks `Authorization`, `Cookie` / `Set-Cookie`, and common token query params and **omits response bodies** from IndexedDB on save (off by default so CORS and kv-search keep real values)
- **Client-side security hardening** — `?expand=` deep links capped at 512 chars; kv-search regex mode uses a per-field CPU budget (50 ms / 1000 matches) to avoid tab freeze; `/compare` only renders clickable external links for `http:` / `https:` URLs (`javascript:` / `data:` shown as plain text)
- All data processed entirely in the browser — no server required
- Persistent state via **IndexedDB v2** across page refreshes: entry metadata in a hot blob; response bodies stored under separate keys and loaded on demand for entry detail, compare Content tab, and content diff

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Other scripts

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `npm run dev`    | Start development server on port 3000 |
| `npm run build`  | Build for production                  |
| `npm run start`  | Start production server               |
| `npm run lint`   | Run ESLint                            |
| `npm test`       | Run the Vitest suite once             |

## Usage

1. **Upload HAR files** — drag one or more `.har` files onto the upload zone, or click to open the file picker. Files can be added incrementally. Parse progress shows the current file name while processing. Optionally enable **Redact credentials before saving** to mask sensitive headers and query params and omit response bodies before data is written to IndexedDB.
2. **Review the insight strip** — see total requests, errors (4xx/5xx/0), total size, and file count at a glance. With two files loaded, headline pair deltas link straight to `/performance/diff`. A CORS chip appears only when the audit has errors or warnings (red / amber). Cards also appear when MIME mismatches, cache validator drift, or pathname anomalies exist. Clean CORS traffic is reached via Tools (**CORS · clear**), not the strip.
3. **Open a tool** — use the Tools row (Performance overview, Pair diff, CORS, kv-search, Entry diff, MIME mismatch, Cache validator, Anomalies) or the primary CTA (single file → file performance; two files → pair diff).
4. **Drill into details** — expand "Full metrics table" on the home page, or click any status code, the "Unique URLs" row, any HTTP method, any content type label, or any content size range to open a details page filtered to that dimension.
5. **Inspect per-file performance** — click a file name chip or the file detail link to see P50/P95/P99 latency, slowest requests, largest resources, and an average timing breakdown across all requests.
6. **See the cross-file performance overview** — open `/performance` from Tools to lay every loaded file out side by side: KPI matrix, timing-phase comparison, shared-axis distribution histogram, per-content-type table, and combined Slowest/Largest top lists.
7. **Compare two specific runs head-to-head** — when at least two files are loaded, use **Compare two runs** (insight strip or performance dashboard) to open `/performance/diff`. Pick a baseline and compare file, toggle Path / Full URL matching, and review headline KPI Δs, per-phase timing Δs, an overlaid histogram, per-content-type Δs, biggest movers, regressions/improvements, and unique-URL listings.
8. **Compare a URL across files** — from the URL detail view, click any URL to open the compare page. The page header links to the captured URL only when it uses `http:` or `https:` (other schemes render as plain text). Expand any request row to see its headers, cookies, a **Timing** tab showing phase-by-phase breakdown (DNS, TCP connect, SSL, send time, TTFB, and receive time), and a **Content** tab displaying the exact text payload of the response.
9. **Diff headers and response bodies** — open **Entry diff** from Tools (or `/entry-diff`). Type a pathname such as `/hello` and select it. The banner shows **Selected path** `/hello`. The table lists every entry whose pathname is `/hello` on **any** host, regardless of query string. Pick baseline and compare, then switch **Headers | Content** tabs:
   - **Headers** — four section cards (request/response headers and cookies) in a 2×2 grid with `−` / `+` / `~` row styling when values differ. Tab chip shows `identical` or `N changes`.
   - **Content** — line-by-line body diff (unified or side-by-side). Rows with **no body** mean `response.content.text` was missing in the HAR; **binary** means a non-text MIME type. Tab chip shows `identical`, `diff`, `binary`, or `no body`. Bodies load only on the Content tab.
   Enable **Match full URL** only when you need an exact URL **including** query.
10. **Review MIME mismatches** — open **MIME mismatch** from Tools (or `/mime-mismatch`). Lists entries whose URL extension does not match effective Content-Type (header used when HAR `content.mimeType` is `x-unknown`). Unknown extensions are hidden by default; enable **Show unverified extensions** for paths like `.aspx` with no built-in MIME map.
11. **Review cache validator drift** — open **Cache validator** from Tools (or `/cache-validator`). Lists pathnames where ETag or Last-Modified differs across entries sharing the same path (query ignored). Weak ETags show a dashed **W** chip; strong tags show **S**. Expand a row to see every entry; use **Entry diff →** to compare bodies or headers on that path. Enable **Show paths with no cache validators** for multi-entry paths with no ETag or Last-Modified on any response.
12. **Review pathname anomalies** — open **Anomalies** from Tools (or `/anomalies`). The hub lists four checks with counts; open a category to expand path groups and entries. Use **Entry diff →** from any expanded row. See [Anomalies: rules and thresholds](#anomalies-rules-and-thresholds) below for exact flag criteria.
13. **Review CORS** — open **CORS** from Tools (or from the insight strip when errors/warnings exist). Filter by file scope, severity, or request Origin. When findings exist, the issues table is shown first; when the audit is clean, the **CORS requests** inventory is promoted so you can browse origins, ACAO, and handshake headers without an empty dead-end.
14. **Search headers and cookies** — open **Search headers/cookies** from Tools (or the per-file link in `/file/[index]`) to open `/kv-search`. Enter a name, value, or URL fragment; pick a mode and scope; paginate through results and expand rows for highlighted matches.
15. **Inspect a single request in depth** — click any URL in the per-file entry list, the "Detail →" link in `/compare`'s expand panel, the expanded URL in a `/kv-search` result, or any of the `/cors` deep links to open `/entry/[file]/[index]`. On entry detail, if HAR `content.mimeType` and the `Content-Type` header disagree (common with Chrome exports), the summary shows both values.
16. **Remove or clear files** — click the × on a file chip to remove it, or use "Clear all" in the header to reset local IndexedDB data.

### Content-Type: HAR body metadata vs response header

Aggregations (**Content Types** on home, file page, and details filters) use an **effective** MIME type:

1. **Primary:** normalized `response.content.mimeType` from the HAR.
2. **Fallback:** normalized `Content-Type` response header when the HAR value is empty, `unknown`, or `x-unknown`.

Entry detail shows a single line when both agree. When they disagree, you see the effective type plus an amber note with **HAR content.mimeType** and the raw **Response header** (including `charset` when present). Compare, entry diff, and MIME mismatch tables show a small **from header** or **≠ HAR** chip on split rows.

Legacy IndexedDB data is re-enriched from stored response headers on load (no re-upload required).

### Anomalies: rules and thresholds

All anomaly checks group by **pathname only** (`pathKey()` — query string and fragment ignored, any host). With **All files** selected, the same path across two HAR captures is one group. Constants live in `utils/anomalies/analyze.ts`.

| Check | Route | When a path is flagged |
| ----- | ----- | ---------------------- |
| **Status** | `/anomalies/status` | ≥2 entries on the pathname and **more than one distinct HTTP status code** among them. |
| **Size drift** | `/anomalies/size` | ≥2 entries with `content.size` **> 0**, and either **max ÷ min ≥ 2** (`SIZE_RATIO_THRESHOLD`) **or** **max − min ≥ 10 KB** (`SIZE_MIN_DELTA_BYTES`). |
| **Encoding** | `/anomalies/encoding` | **Drift:** ≥2 entries on the path with **different `Content-Encoding`** (missing header = `identity`). **Large plain:** ≥1 entry with **effective** compressible type (`text/*`, `application/json`, JS, XML), **no** `Content-Encoding`, and **`content.size` ≥ 50 KB** (`LARGE_UNCOMPRESSED_BYTES`). |
| **Cache policy** | `/anomalies/cache-policy` | ≥2 entries on the path and either **>1 distinct `Cache-Control`** value (among entries that send it) or **>1 distinct `Vary`** value (among entries that send it). Separate from cache-validator (ETag / Last-Modified). |

Home **Anomalies** badge and insight strip use **unique pathnames** with at least one flagged check (not the sum of category row counts). The hub **correlation strip** lists paths hit by multiple checks.

### Large HAR files

For files ≥ 5 MB, an optional Web Worker parse path can be enabled (falls back to main-thread parsing if the worker is unavailable):

- `localStorage.setItem('har_parse_worker', '1')`, or
- build with `NEXT_PUBLIC_HAR_PARSE_WORKER=1`

### Understanding timing data

HAR files record per-request timing phases from `entry.timings`. The app displays six of them:

| Phase   | What it measures                                             |
| ------- | ------------------------------------------------------------ |
| DNS     | DNS lookup time (0 ms on cached/reused connections)          |
| Connect | TCP handshake time (0 ms on keep-alive connections)          |
| SSL     | TLS negotiation time (0 ms on HTTP or reused connections)    |
| Send    | Time to transmit the request to the server                   |
| TTFB    | Server think time — from request sent to first byte received |
| Receive | Time to download the response body                           |

Phases the browser marks as "not applicable" (`-1` in the HAR spec) are shown as 0 ms. The `blocked` phase (connection queuing time) is stored but excluded from the visual breakdowns; this means the bar total may be slightly less than the displayed total request time.

The **file performance page** shows _averages_ of these phases across all requests in a file. The **compare page Timing tab** shows the breakdown for one individual request.

#### Reused vs. new connection

The single-entry detail page (`/entry/[file]/[index]`) tags every request with a green **Reused connection** or slate **New connection** chip in the Performance card. The decision is made by `reusedConnection(timings)` in `utils/entryStats.ts`:

- **Reused connection** — both `dns` and `connect` normalize to `0` (HAR records `-1` for "phase did not apply", which `normalizeTiming` clamps to `0` along with `undefined` / negative / zero values). In a HAR, the browser only fills in DNS lookup and TCP handshake times on the request that opened the socket; every subsequent request multiplexing over an HTTP/2 stream or piggy-backing on an HTTP/1.1 keep-alive socket records both as `-1`.
- **New connection** — either `dns` or `connect` (or both) carries a positive value, meaning at least one of DNS resolution or the TCP handshake actually happened for this request.

`ssl` is deliberately **not** part of the check. TLS resumption (session tickets / 0-RTT) can vary independently of socket reuse, and the chip is only intended to flag "this request skipped DNS + TCP" — the strongest signal that an existing socket was reused. This matches the conflation Chrome DevTools itself applies in its waterfall view.

### How to export a HAR file from your browser

- **Chrome / Edge**: DevTools → Network tab → right-click any request → "Save all as HAR with content"
- **Firefox**: DevTools → Network tab → gear icon → "Save All as HAR"
- **Safari**: DevTools → Network tab → Export icon

## Project Structure

```
har_analyzer/
├── app/                        # Next.js App Router pages (thin orchestrators)
│   ├── layout.tsx
│   ├── page.tsx                # Home: upload, insight strip, tools, comparison table
│   ├── details/page.tsx
│   ├── file/[index]/page.tsx
│   ├── performance/
│   │   ├── page.tsx
│   │   └── diff/page.tsx
│   ├── compare/page.tsx
│   ├── entry-diff/page.tsx     # Headers + Content tabs (canonical)
│   ├── mime-mismatch/page.tsx  # Content-Type vs URL extension audit
│   ├── cache-validator/page.tsx # ETag / Last-Modified drift by pathname
│   ├── anomalies/
│   │   ├── page.tsx             # Anomalies hub
│   │   └── [category]/page.tsx  # status | size | encoding | cache-policy
│   ├── content-diff/page.tsx   # → redirects to /entry-diff?section=content
│   ├── header-diff/page.tsx    # → redirects to /entry-diff?section=headers
│   ├── kv-search/page.tsx
│   ├── cors/page.tsx
│   └── entry/[file]/[index]/page.tsx
├── components/
│   ├── shell/                  # Shared chrome: AppHeader, PageShell, EmptyState, LoadingState
│   ├── home/                   # InsightStrip, PrivacyBanner, RedactSecretsToggle
│   ├── compare/                # ComparePanels (PerFileRow, expand tabs, …)
│   ├── entry-diff/             # EntryPickTable, tabs, metadata, content panel
│   ├── mime-mismatch/          # MIME mismatch table + filters
│   ├── cache-validator/        # Cache validator path groups + ETag display
│   ├── anomalies/              # Hub + category path-group tables
│   ├── content-diff/           # ContentDiffPanels (shared with entry-diff)
│   ├── cors/                   # CorsPanels (KPI, issues, CORS requests inventory, pairs)
│   ├── kv-search/              # KvSearchPanels (paginated results)
│   ├── performance/            # Performance overview panels
│   ├── performance-diff/       # Pair diff panels
│   ├── shared/                 # fileColors, UrlPathPicker, ContentTypeDisplay
│   ├── FileUpload.tsx
│   ├── ComparisonTable.tsx
│   ├── StatusBadge.tsx
│   ├── UnifiedDiffView.tsx
│   ├── SideBySideDiffView.tsx
│   ├── HeaderDiffView.tsx
│   └── timingPhases.ts
├── hooks/
│   ├── useHarStore.ts
│   ├── useUrlPathSelection.ts   # Pathname-first picker (entry diff)
│   ├── useEntryDiffSelection.ts
│   └── useEntryBody.ts         # On-demand body load from IndexedDB (v2)
├── workers/
│   └── harParse.worker.ts      # Optional large-HAR parse (feature-flagged)
├── types/
│   └── har.ts
├── utils/
│   ├── harParser.ts
│   ├── parseHar.ts             # Upload parse + optional worker dispatch
│   ├── storage.ts              # IndexedDB v2: hot metadata + cold body keys
│   ├── privacy.ts              # Opt-in redaction + body stripping on save
│   ├── queryParams.ts          # Shared URL query parsing (`?expand=` cap)
│   ├── safeUrl.ts              # http/https-only external link guard
│   ├── homeInsights.ts         # Cheap home-page rollups
│   ├── entrySearch.ts          # Shared details-table search filter
│   ├── bodyId.ts
│   ├── contentType.ts          # HAR mime vs header resolution + backfill
│   ├── contentDiff.ts
│   ├── entryDiff.ts
│   ├── mimeMismatch.ts
│   ├── cacheValidator.ts
│   ├── anomalies/              # Pathname anomaly analyzers + thresholds
│   ├── headerDiff.ts
│   ├── perfStats.ts
│   ├── perfFormat.ts
│   ├── corsAnalysis.ts
│   ├── kvSearch.ts
│   └── entryStats.ts
├── __tests__/                  # Vitest unit + RTL smoke tests
├── scripts/
│   └── generate-fixture-audits.mjs
└── sample-hars/
    ├── README.md               # Fixture catalog + thresholds reference
    ├── fixture-audits.har      # Intentional audit triggers (regenerate via scripts/)
    ├── sample-a.har
    ├── sample-b.har
    └── sample-c.har
```

## Tech Stack

- **Next.js 16** (App Router, client components)
- **TypeScript** (strict mode)
- **Tailwind CSS v4.3** (`@tailwindcss/postcss`) — light + dark theme via `next-themes`
- **React 19**
- **`diff`** (line and character-level diffing for the Content Diff page)
- **`idb-keyval`** (IndexedDB persistence)
- **Vitest** + **@testing-library/react** + **fast-check** (unit and property-based tests)

See `REFACTOR_PLAN.md` for the full refactor execution log and remaining optional work.
