# HAR Analyzer — Functional Specification

## Overview

HAR Analyzer is a client-side web application that ingests one or more HAR (HTTP Archive) files, parses them in the browser, and presents a comparative summary alongside drill-down detail views. All processing happens locally; no data is sent to a server.

After upload, the **home page** prioritizes a quick insight strip (totals, optional pair deltas, severity-aware CORS chip) and a **Tools** row over the full comparison matrix, which remains one click away behind **Full metrics table**.

---

## 1. File Upload

### 1.1 Supported input

- Files with the `.har` extension or `application/json` MIME type are accepted.
- Multiple files may be selected or dropped in a single interaction.
- Files can be added incrementally across multiple upload interactions; new files are appended to the existing set.

### 1.2 Upload methods

- **Drag-and-drop**: user drags one or more files onto the upload zone. A visual highlight indicates the active drop target.
- **File picker**: clicking the upload zone opens the OS file browser with multi-select enabled.

### 1.3 Validation and error handling

- Files that are not valid JSON or do not contain a `log.entries` array are rejected with an inline error message.
- If `IndexedDB` quota is exceeded during save, the user sees an error explaining the cause.
- Errors are displayed inline below the upload zone and do not block subsequent uploads.

### 1.3a Parse progress

- While one or more files are being read and analyzed, the upload zone shows a status line (e.g. `Parsing 1 of 2: capture.har`) instead of the default drop hint.
- A page-level loading state mirrors the same message.
- For files ≥ 1 MB, the progress line may include a human-readable size (e.g. `(12.4 MB)`).

### 1.3b Optional Web Worker parse

- Files ≥ 5 MB may use a dedicated parse worker when enabled (`localStorage har_parse_worker=1` or build-time `NEXT_PUBLIC_HAR_PARSE_WORKER=1`).
- On worker failure or timeout, parsing falls back to the main-thread path (`parseHarFile` + `analyzeHar`).
- When the worker is disabled or the file is small, parsing uses the existing `FileReader` main-thread path.

### 1.3c Privacy controls

- **Banner (first visit)** — dismissible notice that HARs may contain credentials and that data stays in this browser's IndexedDB. Dismissal is persisted in `localStorage` (`har_privacy_banner_dismissed=1`).
- **Redact credentials before saving (opt-in, off by default)** — when checked, `redactAnalysis()` masks sensitive request/response headers (`Authorization`, `Cookie`, `Set-Cookie`, …), cookie values, and common token query params before the store is written. `saveHarStoreAsync()` also strips response bodies from entries, deletes existing cold body keys, and does not persist new body blobs. Real values (including bodies) remain available for CORS / kv-search / content diff when redaction is off.

### 1.3d Client-side security hardening

- **`?expand=` length cap** — `parseExpandParam()` (`utils/queryParams.ts`) returns `""` when the param exceeds 512 characters. Applied on `/cors`, `/kv-search`, `/mime-mismatch`, `/cache-validator`, and `/anomalies/[category]`.
- **kv-search regex budget** — regex mode (`utils/kvSearch.ts`) enforces a 50 ms per-haystack CPU budget and a 1000-match cap. On timeout the search returns no hits and surfaces an inline error (`Pattern timed out — simplify the regex or narrow scope`).
- **Safe external navigation** — `/compare` renders the page-title URL as a clickable `<a>` only when `isNavigableHttpUrl()` (`utils/safeUrl.ts`) accepts it (`http:` / `https:`). Other schemes (`javascript:`, `data:`, …) render as plain text.

### 1.4 File management

- Each loaded file is shown as a chip displaying the file name and request count.
- Individual files can be removed via the × button on their chip; indices are recomputed on removal.
- "Clear all" removes all files and clears persisted storage.

### 1.5 Persistence (IndexedDB v2)

- Parsed analysis **metadata** is serialized to a hot IndexedDB key (`har_analyzer_data`, schema `HarStore.version = 2`).
- Response bodies are **not** stored inline in the hot blob. Each entry with captured text gets a stable `bodyId`; the body is persisted under a separate cold key (`har_analyzer_body:{bodyId}`).
- `EntryRecord` in memory may still carry `responseContent` after parse; on save the hot blob strips bodies and sets `hasResponseBody: true` where applicable.
- On load, legacy v1 single-blob stores are migrated when possible; otherwise the user is prompted to re-upload.
- Bodies are loaded on demand via `useEntryBody` for `/entry/[file]/[index]`, the compare page Content tab, and content diff.
- On page load, hot metadata is restored automatically; bodies hydrate when a view needs them.

---

## 2. HAR Parsing

### 2.1 Fields extracted per entry

| Field            | Source in HAR                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| URL              | `entry.request.url`                                                                                                           |
| HTTP method      | `entry.request.method`                                                                                                        |
| Status code      | `entry.response.status`                                                                                                       |
| Status text      | `entry.response.statusText`                                                                                                   |
| Content type     | `entry.response.content.mimeType` (normalized, see 2.2)                                                                       |
| Content size     | `entry.response.content.size`                                                                                                 |
| Body size        | `entry.response.bodySize`                                                                                                     |
| Response time    | `entry.time` (ms)                                                                                                             |
| Request headers  | `entry.request.headers`                                                                                                       |
| Response headers | `entry.response.headers`                                                                                                      |
| Request cookies  | `entry.request.cookies` (falls back to parsing `Cookie` header)                                                               |
| Response cookies | `entry.response.cookies` (falls back to parsing `Set-Cookie` headers)                                                         |
| Server IP        | `entry.serverIPAddress`                                                                                                       |
| Start Time       | `entry.startedDateTime`                                                                                                       |
| Response Content | `entry.response.content.text` (persisted under cold IDB key when saved; see §1.5) |
| `bodyId`         | Generated when a response body exists at parse time (v2 storage)                  |
| `hasResponseBody`| Set when `response.content.text` was present at parse time (`undefined` field ⇒ false, even if `content.size` > 0) |
| `indexInFile`    | Zero-based position of the entry within its parent file (`entries.length` at parse); used for stable `entryId` and `/entry/[file]/[index]` |
| Timing phases    | `entry.timings`: `dns`, `connect`, `ssl`, `send`, `wait`, `receive`, `blocked` (optional phases use `-1` when not applicable) |

### 2.2 HAR timing model

The HAR spec defines **two separate timing concepts**. This app uses only the per-request one.

**`entry.timings`** (used) — phase breakdown for each individual HTTP request:

| Phase     | What it measures                                                                      | Optional?                                                 |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `blocked` | Time queued before the connection could start (browser connection limit, cache check) | Yes — `-1` if N/A                                         |
| `dns`     | DNS lookup time                                                                       | Yes — `-1` if address was cached or connection was reused |
| `connect` | TCP handshake time                                                                    | Yes — `-1` if keep-alive connection was reused            |
| `ssl`     | TLS negotiation time (overlaps with `connect` on HTTPS)                               | Yes — `-1` if HTTP or connection was reused               |
| `send`    | Time to transmit the request body to the server                                       | No                                                        |
| `wait`    | **TTFB** — time from request sent to first byte of response (server think time)       | No                                                        |
| `receive` | Time to download the response body                                                    | No                                                        |

`entry.time` is the total request duration including all phases. The `blocked` phase is stored but not shown in timing breakdown displays; as a result the bar total may be slightly less than `entry.time` for requests with a non-trivial queuing delay.

Optional phases report `-1` to indicate "not applicable" (e.g. `dns` and `connect` are `-1` on keep-alive requests). The app treats `-1` as `0` when computing totals and percentages.

**`pageTimings`** (not used) — browser-level page milestones stored in `log.pages[].pageTimings` (`onContentLoaded`, `onLoad`). These represent whole-page load events, not individual request costs, and are not read by this application.

### 2.4 Content type normalization

- The `mimeType` value is split on `;` and only the first segment is retained (strips charset and boundary parameters).
- The result is lowercased and trimmed.
- A missing or empty `mimeType` is recorded as `unknown`.

### 2.4a Effective Content-Type (HAR vs response header)

Analyzer: `utils/contentType.ts` (`resolveContentType`, `enrichEntryContentType`, `rebuildContentTypeCounts`).

| Field | Source |
| ----- | ------ |
| `contentMimeType` | Normalized `response.content.mimeType` |
| `headerContentType` | Raw `Content-Type` response header |
| `contentType` (effective) | HAR MIME when meaningful; otherwise normalized header MIME |
| `contentTypeFromHeader` | `true` when effective type came from the header fallback |
| `contentTypeSourcesAgree` | `false` when HAR MIME is junk (`unknown`, `x-unknown`, empty) but header has a real type |

- **Content Types** counts and `/details?type=contentType` filters use the **effective** type.
- Entry detail shows a single line when sources agree; otherwise an amber split (HAR `content.mimeType` vs response header).
- List tables may show **from header** or **≠ HAR** chips (`ContentTypeDisplay`).
- Legacy IndexedDB entries backfill from stored `responseHeaders` on load (`normalizeAnalyses` in `harParser.ts`).

### 2.5 Per-file aggregates computed

- `totalRequests` — total entry count
- `totalContentSize` — sum of `entry.response.content.size` across all entries (bytes)
- `statusCodeCounts` — map of `{ statusCode: count }`
- `methodCounts` — map of `{ uppercaseMethod: count }`; missing / empty `request.method` is bucketed as `(no method)`
- `contentTypeCounts` — map of `{ normalizedMimeType: count }`
- `contentSizeBucketCounts` — map of `{ bucketLabel: count }` using five ranges: `0 B – 1 KB`, `1 KB – 10 KB`, `10 KB – 100 KB`, `100 KB – 1 MB`, `1 MB+`
- `uniqueUrlCount` — count of distinct URL strings

---

## 3. Home Page

Displayed after at least one file is loaded (in addition to §1 upload chrome).

### 3.1 Layout (top to bottom)

| Region | Content |
| ------ | ------- |
| Privacy banner | First-visit credentials notice (§1.3c); hidden after dismiss |
| Upload zone | §1 — shows parse progress while processing |
| Insight strip | §3.2 |
| Loaded file chips | §1.4 |
| Tools row | §3.3 |
| Full metrics table | §3.4 — collapsed by default behind a toggle |

### 3.2 Insight strip

Backed by `utils/homeInsights.ts` (`computeHomeInsights`) — uses per-file rollups plus optional reports from `corsAnalysis`, `mimeMismatch`, `cacheValidator`, and `anomalies` (cheap counts only; no full entry walks for perf stats).

| Element | Behaviour |
| ------- | --------- |
| Stat cards | Total requests · errors (4xx/5xx/0) · total size · file count |
| Pair deltas | When ≥ 2 files: headline Δ for requests, errors, and bytes between files 0 and 1, linking to `/performance/diff?base=0&cmp=1` |
| Primary CTA | One file → **Open file performance** (`/file/0`); two or more → **Compare two runs** (`/performance/diff`) |
| CORS chip | Shown when `crossOriginCount > 0`. Copy is severity-aware: red **CORS audit — N errors**, amber **CORS — N warnings**, neutral **N cross-origin requests — all clear**. Links to `/cors` |
| MIME mismatch card | When `mismatchCount > 0` — links to `/mime-mismatch` |
| Cache validator card | When `pathConflictCount > 0` — links to `/cache-validator` |
| Anomalies card | When `uniquePathCount > 0` — links to `/anomalies`; subtitle summarizes category counts |
| Per-file footnote | Single-file mode: unique URL count (+ error count when > 0) linking to `/file/{index}` |

### 3.3 Tools row

Horizontal link group (always visible when data is loaded):

| Link | Notes |
| ---- | ----- |
| Performance overview | `/performance` |
| Pair diff | `/performance/diff` when ≥ 2 files |
| CORS | `/cors` when cross-origin traffic exists; badge = error count, warning count, or **clear** label |
| Search headers/cookies | `/kv-search` |
| Entry diff | `/entry-diff` |
| MIME mismatch | `/mime-mismatch` — badge = mismatch count or **clear** |
| Cache validator | `/cache-validator` — badge = path groups with ETag/LM drift or **clear** |
| Anomalies | `/anomalies` — badge = unique paths with any anomaly or **clear** |
| Content diff (legacy) | `/content-diff` → redirects to `/entry-diff?section=content` |
| Header diff (legacy) | `/header-diff` → redirects to `/entry-diff?section=headers` |

### 3.4 Comparison table (collapsible)

On the home page the table is hidden behind **Full metrics table** (toggle); expanding it shows the same `ComparisonTable` component described in §3.5–§3.8.

### 3.5 Structure

- One column per loaded HAR file, with the file name as the column header (truncated with a tooltip if long).
- Rows grouped into five sections: totals, status codes, HTTP methods, content types, and content size. (Server IPs render as an additional section below when present.)

### 3.6 Rows

| Row                                                                                        | Value shown                        | Clickable?                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| Total Requests                                                                             | Integer count per file             | No                                                               |
| Unique URLs                                                                                | Integer count per file             | Yes — links to `/details?type=url`                               |
| _[status code]_ (one row per unique code across all files)                                 | Count per file, `—` if absent      | Yes — links to `/details?type=status&value={code}`               |
| _[HTTP method]_ (one row per unique method across all files, canonical order then alpha)   | Count per file, `—` if absent      | Yes — links to `/details?type=method&value={encoded}`            |
| _[content type]_ (one row per unique type across all files)                                | Count per file, `—` if absent      | Yes — links to `/details?type=contentType&value={encoded}`       |
| Total Response Size                                                                        | Human-readable byte total per file | No                                                               |
| _[size bucket]_ (`0 B – 1 KB`, `1 KB – 10 KB`, `10 KB – 100 KB`, `100 KB – 1 MB`, `1 MB+`) | Count per file, `—` if absent      | Yes — links to `/details?type=contentSizeBucket&value={encoded}` |

### 3.7 Section headers

- "Status Codes", "HTTP Methods", "Content Types", and "Content Size" section headers span all columns and visually separate the groups. Methods are sorted in canonical order (`GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, CONNECT, TRACE`) followed by any non-canonical methods alphabetically, with `(no method)` pinned to the end of the section when present.

### 3.8 Status code color coding (row labels)

| Range | Color  |
| ----- | ------ |
| 2xx   | Green  |
| 3xx   | Yellow |
| 4xx   | Orange |
| 5xx   | Red    |
| Other | Slate  |

---

## 4. Details Pages and Tool Routes

Sections **4.1–4.5** describe `/details` query-param views. Sections **4.6–4.16** describe standalone tool routes (`/file`, `/compare`, `/cors`, …). All tool pages use the shared **`PageShell`** (`AppHeader`, back link, optional crumb, `EmptyState`, `LoadingState`).

### 4.1 `/details` common elements

All detail views live at `/details` and are distinguished by query parameters:

| Parameter | Values                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | `status` \| `url` \| `contentType` \| `contentSizeBucket` \| `serverIPAddress` \| `userAgent` \| `method`                                                                     |
| `value`   | Status code integer, URL-encoded content type string, URL-encoded size bucket label, server IP address, user agent string, or URL-encoded HTTP method; omitted for `type=url` |

Elements shared by every `/details` view:

- Back link returning to `/`
- Page title describing the filter dimension and value
- Entry count / URL count summary line
- Search/filter input that performs case-insensitive substring matching across URL, content type, status code, and file name fields (implemented via `filterEntriesBySearch` in `utils/entrySearch.ts`)

### 4.2 Status code detail (`type=status`)

Displays a sortable table of all entries across all files whose `response.status` matches `value`.

Columns:

| Column       | Sortable | Notes                                                                      |
| ------------ | -------- | -------------------------------------------------------------------------- |
| URL          | Yes      | Truncated to 80 chars, full URL on hover; opens in new tab                 |
| Start Time   | Yes      | Human-readable UTC date + time                                             |
| Status       | Yes      | Color-coded badge; links to status detail for that code                    |
| Content Type | Yes      | Links to content type detail                                               |
| Size         | Yes      | Human-readable (B / KB / MB); shows `N/A` for unknown sizes (HAR sentinel) |
| Time         | Yes      | Human-readable (ms / s)                                                    |
| HAR File     | Yes      | Truncated with title tooltip                                               |

### 4.3 Content type detail (`type=contentType`)

Same table structure as status code detail, filtered to entries whose normalized content type equals `value`.

### 4.4 Content size bucket detail (`type=contentSizeBucket`)

Same table structure as status code detail, filtered to entries whose `response.content.size` falls within the selected size range. Page title displays "Content Size: {bucket label}" (e.g. "Content Size: 1 KB – 10 KB").

Size bucket boundaries:

| Bucket label     | Range                     |
| ---------------- | ------------------------- |
| `0 B – 1 KB`     | 0 – 1,023 bytes           |
| `1 KB – 10 KB`   | 1,024 – 10,239 bytes      |
| `10 KB – 100 KB` | 10,240 – 102,399 bytes    |
| `100 KB – 1 MB`  | 102,400 – 1,048,575 bytes |
| `1 MB+`          | ≥ 1,048,576 bytes         |

### 4.5 URL detail (`type=url`)

Displays entries grouped by URL rather than a flat list.

**Summary table columns:**

| Column                                     | Notes                                                 |
| ------------------------------------------ | ----------------------------------------------------- |
| (expand toggle)                            | ▶ / ▼                                                 |
| URL                                        | Truncated to 80 chars                                 |
| Total Hits                                 | Sum across all files                                  |
| _[file name]_ (one column per loaded file) | Hit count for that file, blank if zero                |
| Avg Size                                   | Average `contentSize` across all entries for this URL |
| Avg Time                                   | Average `time` across all entries for this URL        |

**Expanded row:**
Clicking a URL row expands an inline sub-table showing each individual entry with: HAR file, start time, status badge (links to status detail), content type (links to content type detail), size, time.

### 4.5a Server IP detail (`type=serverIPAddress`)

Same table structure as status code detail, filtered to entries whose `serverIPAddress` matches `value`. The special value `(no IP)` matches entries with no recorded server IP.

### 4.5b User agent detail (`type=userAgent`)

Same table structure as status code detail, filtered to entries whose `User-Agent` request header matches `value` exactly.

### 4.5c HTTP method detail (`type=method`)

Same table structure as status code detail, filtered to entries whose `request.method` matches `value` case-insensitively (the comparison-table link encodes `method.toUpperCase()`, so `GET` / `get` / `Get` all collapse to the same row). The special value `(no method)` matches entries whose `request.method` is missing or empty after trimming. Page title is `HTTP Method: {value}` (or `Requests with No HTTP Method` for the `(no method)` sentinel).

### 4.6 Per-file performance dashboard (`/file/[index]`)

Displays a performance summary for a single loaded HAR file.

**Sections:**

| Section              | Content                                                                                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance Summary  | P50, P95, P99 response times; error rate (4xx/5xx %); total transferred bytes                                                                                                                                                                                                                        |
| Slowest Requests     | Top 10 entries by `time`, shown with URL, duration, and a proportional bar; links to compare page                                                                                                                                                                                                    |
| Largest Resources    | Top 10 entries by `contentSize`, shown with URL, size, and a proportional bar; links to compare page                                                                                                                                                                                                 |
| Avg Timing Breakdown | Stacked bar + legend grid showing average DNS, Connect, SSL, Send, TTFB (wait), and Receive time across all requests; phases < 0.5% share are hidden from the bar. Calculated as `sum(phase_ms across all entries) / n`, with HAR `-1` values treated as 0. `blocked` is excluded from this display. |

**URL state:** Accepts an optional `?search={text}` query parameter that pre-populates the per-file entry search/filter input. Used by the Pair Diff Dashboard's Unique URLs section (§4.11) to deep-link directly to a filtered request list.

### 4.7 Per-URL comparison page (`/compare?url={encoded}`)

Displays all recorded entries for a specific URL grouped by HAR file, enabling cross-file comparison.

**Page header URL** — the captured URL is shown in a monospace block. When the URL uses `http:` or `https:`, it is a clickable external link (`target="_blank"`, `rel="noopener noreferrer"`). Non-HTTP(S) schemes render as plain text (no `href`) to avoid `javascript:` / `data:` navigation from HAR content.

**Per-file summary row**: HAR file name, hit count, observed status codes, content types, avg/min/max response time, avg size, server IPs, user agents. Expandable to show individual entries.

**Expanded entry detail** — clicking an individual request shows a tabbed panel:

| Tab      | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request  | Request headers table + request cookies table                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Response | Response headers table + response cookies table                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Timing   | Per-request timing breakdown: stacked bar (DNS → Connect → SSL → Send → TTFB → Receive) + phase grid showing ms value and % of total for each phase. Calculated as `phase_ms / sum(all phases)` for a single entry, with HAR `-1` values treated as 0. `blocked` is excluded from this display. Phases < 0.5% of total are hidden from the bar but shown in the grid. Shows "No timing data available" when all phases sum to zero (e.g. fully cached responses). |
| Content  | Response text body block                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**All-entries flat table**: Below the per-file sections, a sortable paginated table lists every entry for the URL across all files with columns for HAR file, start time, status, content type, size, and time.

### 4.8 Entry Diff page (`/entry-diff?url={encoded}&section={headers|content}`)

Unified comparison of **headers/cookies** and **response bodies** between any two entries that share the same **pathname** (e.g. `/hello`), **across hosts**. Exact full-URL matching is an optional escape hatch. Uses `UrlPathPicker`, `useUrlPathSelection`, and `useEntryDiffSelection`.

**Tabs:** **Headers | Content** with status chips (`identical`, `N changes`, `diff`, `binary`, `no body`, etc.). Default tab when `?section=` is omitted: **Headers** if header/cookie diff has changes, otherwise **Content**. Response bodies load from cold storage only when the **Content** tab is active.

Legacy routes `/content-diff` and `/header-diff` redirect here with `?section=content` or `?section=headers`.

**URL / path search:** same rules as prior content/header diff (§4.8–4.9 in v0.2.0): pathname-first dropdown, query ignored in path mode, **Match full URL** escape hatch, `?url=` deep links normalized via `pathKey()`.

**Entry table columns:**

| Column          | Notes                                                              |
| --------------- | ------------------------------------------------------------------ |
| Baseline        | Radio button to designate this entry as the baseline               |
| Compare         | Radio button to designate this entry as the comparison target      |
| HAR File        | File name (font-mono, truncated)                                   |
| URL             | Full URL including query string; links to `/compare?url={encoded}` |
| Status          | Color-coded status badge                                           |
| Content Type    | Normalized MIME type                                               |
| Size            | Human-readable response body size                                  |
| Req/Res Headers | Count of request headers / response headers (right-aligned)        |
| Req/Res Cookies | Count of request cookies / response cookies (right-aligned)        |
| Timestamp (UTC) | `startedDateTime` formatted as UTC                                 |
| Body            | Optional badge: **binary** or **no body** (see body capture table below) |

Row keys use `entryId()` → `{harFileIndex}::{indexInFile}`.

**Body capture vs display:**

| Signal in HAR | `hasResponseBody` | Badge | Line diff? |
| --------------- | ----------------- | ----- | ---------- |
| `content.text` present (may be `""`) | `true` | — | Yes (if not binary MIME) |
| No `content.text`, any MIME | `false` | **no body** | No — hash panel or “not captured” message |
| Binary MIME (`image/`, `video/`, `pdf`, …) | either | **binary** | No — hash panel when body captured |

**Headers tab** (when two different entries are selected): metadata bar; green identical banner when all four sections match; `HeaderDiffView` 2×2 card grid (Request/Response Headers + Cookies).

**Key-value diff table** (one per section card; `table-fixed` with Name / Baseline / Compare columns):

| Row style                    | Meaning                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Red background, `−` prefix   | Header/cookie present only in baseline (removed)                                                   |
| Green background, `+` prefix | Header/cookie present only in compare (added)                                                      |
| Amber background, `~` prefix | Present in both but value changed; baseline value shown with strikethrough, compare value in green |
| No highlight                 | Equal in both entries                                                                              |

Header names are compared case-insensitively; values case-sensitively. Duplicate header names are matched positionally.

**Content tab:** metadata bar shared above tabs; mode toggle (Unified / Side-by-Side); identical banner; JSON prettified label; truncation notices; unified or side-by-side diff; binary / no-body SHA-256 fallback panel when line diff is unavailable.

### 4.9 Header Diff / Content Diff (legacy redirects)

`/header-diff` and `/content-diff` are client pages that `router.replace` once to `/entry-diff` with `?section=headers` or `?section=content`, preserving existing query params. Tab switching on `/entry-diff` is local state and does not rewrite the URL.

### 4.9.1 MIME mismatch page (`/mime-mismatch`)

Compares normalized response `Content-Type` to the URL pathname extension (query ignored). Analyzer: `utils/mimeMismatch.ts` (`analyzeStore`, `analyzeMimeMismatch`).

**Rules:**

| Case | Listed? |
| ---- | ------- |
| No pathname extension (e.g. `/api/users`) | Skipped |
| `contentType` empty or `unknown` | Skipped |
| Known extension, MIME not in expected set | **mismatch** (default table) |
| Unknown extension (not in built-in map) | **unverified** — hidden unless **Show unverified extensions** (`?unverified=1`) |

**UI:** file scope chips, KPI row, paginated table (50 rows) with Kind, File, Method, Status, URL, Ext, Content-Type, Expected, Size, link to `/entry/[file]/[index]`. Home Tools badge and insight strip card when `mismatchCount > 0`.

### 4.9.2 Cache validator page (`/cache-validator`)

Groups entries by pathname (query ignored via `pathKey()`). Analyzer: `utils/cacheValidator.ts`.

**Drift rules:** ≥2 entries on the same pathname; among entries that send each header, more than one distinct normalized **ETag** and/or **Last-Modified**. Weak ETags (`W/…`) use a distinct comparison key from strong tags with the same quoted value.

**UI:** file scope; path-group table with drift kind (ETag / Last-Modified / both); **W** (dashed violet) vs **S** (solid) ETag chips; expandable entry list; **Entry diff →** (`?url=/pathname`). Optional **Show paths with no cache validators** (`?no-validator=1`) for ≥2 entries with neither header. Home Tools badge (`pathConflictCount`) and insight strip when drift exists.

### 4.9.3 Anomalies hub (`/anomalies` and category routes)

Pathname-level inconsistency audits. Analyzer: `utils/anomalies/` (`analyzeStore`). Hub links to:

| Route | Check |
| ----- | ----- |
| `/anomalies/status` | ≥2 entries, distinct HTTP status codes |
| `/anomalies/size` | ≥2 entries with `content.size` > 0, max/min ≥ **2** or max − min ≥ **10 KB** |
| `/anomalies/encoding` | Encoding drift (≥2 entries, distinct `Content-Encoding`; missing = `identity`) or large uncompressed (compressible type, no encoding, size ≥ **50 KB**) |
| `/anomalies/cache-policy` | ≥2 entries, >1 distinct `Cache-Control` or >1 distinct `Vary` (among entries that send each header) |

Constants: `SIZE_RATIO_THRESHOLD`, `SIZE_MIN_DELTA_BYTES`, `LARGE_UNCOMPRESSED_BYTES` in `utils/anomalies/analyze.ts`.

**UI:** hub cards with per-category counts; **correlation strip** for paths flagged by multiple checks; category pages mirror cache-validator layout (file scope, expandable path groups, entry tables, **Entry diff →**). Home **Anomalies** badge uses **unique pathnames** with any finding (not sum of category row counts). Insight strip when `uniquePathCount > 0`. Footer links to MIME mismatch, cache validator, and CORS.

**Fixture:** `sample-hars/fixture-audits.har` (see `sample-hars/README.md`) triggers all categories for smoke tests.

### 4.10 Cross-file Performance Dashboard (`/performance`)

Multi-file performance overview that lays every loaded HAR file out side by side. Linked from the home **Tools** row and insight-strip primary CTA once at least one file is loaded.

**Sections (top to bottom):**

| Section                      | Content                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legend bar                   | Color swatch + file name for each loaded file (10-color palette, cycled when more files are loaded). When `analyses.length >= 2`, hosts a **"Compare two runs →"** pill linking to `/performance/diff` (§4.11).                                                                                                                                     |
| KPI matrix                   | One row per file with columns: Total Requests, Avg time, P50, P95, P99, Max time, Total Bytes, Error rate, Wall-clock span. Numeric cells render a proportional bar on a per-column shared scale (max across all files) so cross-file magnitude is visible at a glance.                                                                             |
| Avg Timing-Phase Comparison  | One stacked bar per file on a shared total-ms axis, segmented by DNS · Connect · SSL · Send · TTFB · Receive (six-color phase palette). Phases < 0.5% share are hidden from the bar but shown in the per-phase grid below. Calculated as `sum(phase_ms across all entries) / n` per file, with HAR `-1` values treated as 0; `blocked` is excluded. |
| Response-Time Distribution   | 10-bucket histogram. Bucket edges are derived once over the **union** of all files' `entry.time` values so bars are directly comparable. Per-file bars are color-coded with the legend palette. URL-driven Log / Linear toggle.                                                                                                                     |
| Per Content-Type Performance | Sticky left column lists each unique normalized MIME type across all files. For each file, four columns show Count, Total bytes, Avg time, and P95 time. Rows are ordered by total count across all files.                                                                                                                                          |
| Combined Top-N               | Two adjacent lists: Slowest 10 entries by `entry.time` and Largest 10 entries by `contentSize`, each computed across **all** loaded files. Each row shows a file color dot, URL, the metric value, and a proportional bar; clicking opens the per-URL compare page.                                                                                 |

**URL state:**

| Parameter | Values            | Default                                                        |
| --------- | ----------------- | -------------------------------------------------------------- |
| `scale`   | `log` \| `linear` | `log` (controls the Response-Time Distribution histogram axis) |

### 4.11 Pair Diff Dashboard (`/performance/diff`)

Dedicated baseline-vs-compare delta view for two specific HAR files. Discovery links appear on the home page (next to the Performance Dashboard pill) and on `/performance` (in the legend bar) whenever `analyses.length >= 2`.

**Pre-conditions and fallbacks:**

- **No files loaded** — page shows a "No HAR files loaded" message and a link back to upload.
- **Only one file loaded** — page shows a "Pair-mode comparison needs at least 2 HAR files" hint with links to upload and to the performance overview.
- **`base === cmp`** — picker bar still rendered, but all comparison sections are hidden in favor of a "Pick two different files" hint.

**URL state:**

| Parameter | Values                      | Default                                   |
| --------- | --------------------------- | ----------------------------------------- |
| `base`    | File index `[0, fileCount)` | `0`                                       |
| `cmp`     | File index `[0, fileCount)` | `1` (or `0` when only one file is loaded) |
| `match`   | `path` \| `full`            | `path`                                    |
| `scale`   | `log` \| `linear`           | `log`                                     |

**Picker bar:** Baseline and Compare file `<select>` controls + a **Match** toggle (Path / Full URL). Path mode strips the query string and fragment before keying entries by URL; Full mode treats every distinct URL (including query string) as its own key. The Match selection drives every URL-keyed comparison on the page (Regressions, Biggest Movers, Unique URLs).

**Sections (in order):**

| Section                      | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headline metrics (KPI Δ)     | Per-metric rows (Total Requests, Avg time, P50, P95, P99, Max time, Total Bytes, Error rate, Wall-clock span) with columns Base · Compare · Δ · % change. Δ and % cells are color-tinted via `deltaTone` according to each metric's direction-of-improvement (lower-is-better for time / error rate / wall-clock; neutral for counts / bytes). Δ values use real U+2212 minus signs for negatives and an explicit `+` for positives.                                                  |
| Timing-Phase Δ               | Two stacked bars labelled BASELINE / COMPARE on a shared total-ms axis (the wider bar reaches the right edge), each segmented by the same six phases as §4.10 with hover tooltips. Beneath: a per-phase Δ table with columns Phase · Base · Compare · Δ · % change, plus a bold Total row on a tinted background.                                                                                                                                                                     |
| Response-Time Distribution Δ | 10-bucket overlaid histogram. Bucket edges are derived once over the **union** of both runs. Each bucket renders two side-by-side mini-bars: blue for baseline, orange for compare. Bar height is normalized to the larger per-bucket count across both runs. Footer legend shows both swatches, file names, and per-side total request counts. Log / Linear toggle via `?scale=`.                                                                                                    |
| Per Content-Type Δ           | One row per MIME type from the union of both runs. Columns are grouped as Content type · Count {Base, Cmp, Δ} · Bytes {Base, Cmp, Δ} · Avg time {Base, Cmp, Δ} · P95 time {Base, Cmp, Δ}. Sortable by any group. Δ cells use `deltaTone` (lower-is-better for time, neutral for count/bytes).                                                                                                                                                                                         |
| Biggest Movers               | Two top-10 tables ranked by absolute Δ time and absolute Δ size respectively (`\|Δtime\|`, `\|Δsize\|`). Surfaces the largest absolute movements regardless of direction — both regressions and improvements appear together, so a large drop in size or time is just as visible as a large rise. Each row links to `/compare?url={encoded}`.                                                                                                                                         |
| Regressions & Improvements   | Two side-by-side top-10 tables. Left card (red header): URLs that got slower in compare; right card (green header): URLs that got faster. Columns: URL · Base · Cmp · Δ · % change. Header badges show total counts of regressed / improved URLs respectively. Δ uses U+2212 for negatives; both Δ and % cells share `deltaTone(deltaTime, "lower")` so each row's semantic tint is consistent.                                                                                       |
| Unique URLs                  | Two side-by-side cards consuming `onlyInBase` / `onlyInCompare`, color-tinted blue / orange to match the histogram. Sortable columns: URL · Count · Median time · Median size. Default sort is Count desc, tie-broken by Median time desc. Each row deep-links to `/file/{baseIndex \| cmpIndex}?search={encoded key}` (the key is the path in path-match mode, the full URL in full-match mode), so the user lands on the source file's request table pre-filtered to that endpoint. |

**Δ formatting helpers** (`utils/perfFormat.ts`):

- `formatDelta(value, formatter)` — prefixes positives with `+`, negatives with U+2212 (real minus, not hyphen), zero with no sign.
- `formatPctChange(base, cmp)` — `(cmp - base) / base × 100`, formatted with 1 decimal place; returns `—` when `base === 0`.
- `deltaTone(delta, direction)` — returns the Tailwind class string for the cell tint. `direction` is `"lower"` (lower is better — green for negative Δ, red for positive), `"higher"`, or `"neutral"` (no tint).

### 4.12 CORS page (`/cors`)

Cross-Origin Resource Sharing **audit and inventory** backed by the pure analyzer in `utils/corsAnalysis.ts`. Surfaces CORS findings with handshake context and lists every cross-origin / preflight entry even when the audit is clean. Discovery links appear on the home insight strip, Tools row, and each per-file page when the relevant file has cross-origin traffic.

**Pre-conditions and fallbacks:**

- **No files loaded** — page shows the standard "No HAR files loaded" message and a link back to upload.
- **No cross-origin traffic** — KPI cards render with zeros; both the issues table and CORS requests inventory show empty-state copy.

**URL state:**

| Parameter  | Values                                  | Default |
| ---------- | --------------------------------------- | ------- |
| `file`     | `all` \| file index `[0, fileCount)`    | `all`   |
| `severity` | `all` \| `error` \| `warning` \| `info` | `all`   |
| `origin`   | one of the request `Origin` values seen | `""`    |
| `expand`   | `<fileIndex>:<entryIndex>`              | `""`    |

`expand` deep-links to a specific entry: when present on initial load, the matching row is pre-expanded and scrolled into view (issues table or CORS requests table). Values longer than **512 characters** are ignored (`parseExpandParam`).

**Detection model:**

A request is **cross-origin** when its `Origin` request header is present and that origin differs from the request URL's origin (`null`-origin requests are also treated as cross-origin). A **preflight** is an `OPTIONS` request that carries `Access-Control-Request-Method`. Each preflight is paired with the matching actual request by `(URL, ACRM-method)` within `PREFLIGHT_PAIR_WINDOW_MS = 5000`; an actual request is consumed by at most one preflight.

**Finding kinds** (`utils/corsAnalysis.ts` → `CorsFindingKind`):

| Kind                             | Severity | Trigger                                                                                                                        |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `preflight-failed`               | error    | OPTIONS preflight returned `0` (failed) or `>= 400`                                                                            |
| `preflight-slow`                 | warning  | OPTIONS preflight `entry.time > PREFLIGHT_SLOW_MS` (1000 ms)                                                                   |
| `acao-missing`                   | error    | Cross-origin response has no `Access-Control-Allow-Origin` header                                                              |
| `acao-mismatch`                  | error    | `ACAO` is neither `*` nor an exact match of the request `Origin`                                                               |
| `acao-wildcard-with-credentials` | error    | `ACAO: *` paired with a credentialed (Cookie / Authorization) actual request, or with `Access-Control-Allow-Credentials: true` |
| `method-not-allowed`             | error    | Preflight's `Access-Control-Request-Method` is not in the response's `Access-Control-Allow-Methods`                            |
| `header-not-allowed`             | error    | Any token in `Access-Control-Request-Headers` is missing from `Access-Control-Allow-Headers` (wildcard `*` accepted)           |
| `credentials-flag-missing`       | error    | Credentialed actual request whose response lacks `Access-Control-Allow-Credentials: true`                                      |
| `actual-request-blocked`         | error    | Cross-origin actual request returned `0` or `>= 400` and the response carries no CORS headers                                  |

Findings carry an optional `detail: { sent?, expected?, received? }` triplet that the handshake panel renders as inline cards.

**Sections (in order):**

| Section              | Content                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page title           | **CORS** — subtitle includes cross-origin / preflight counts and `· no issues` when `errorCount + warningCount === 0`                                                                                                                                                                                                                                                                                                            |
| Scope bar            | File chips (All files + per-file with palette dot and finding count) + severity chips (All / Error / Warning / Info) + an Origin `<select>` rendered when more than one Origin is present. All bound to URL state.                                                                                                                                                                                                               |
| KPI summary          | Four cards: **Total findings** (with `error / warning / info` sub-line), **Failed preflights** (`failedPreflightCount` / total preflights), **Slow preflights** (count of `preflight-slow` findings, `> 1000 ms`), **Cross-origin requests** (non-preflight cross-origin entries with the `Origin` header).                                                                                                                      |
| Issues table         | Flat one-row-per-finding table (sorted error → warning → info). Columns: Severity · Kind · File (in `all` scope) · Status · Method (with `PF` chip on preflights) · URL · Time · Detail. Rows are click-to-expand and toggle `?expand=<entryId>`. When no rows match filters, shows **No CORS issues detected** (green) with filter-aware copy.                                                                                  |
| CORS requests table  | Paginated (50 rows/page) inventory of **every** cross-origin and preflight `CorsEntry` in scope (respects Origin filter). Columns: Type (Actual / Preflight) · File (in `all` scope) · Status · Method · Request Origin · ACAO · URL · Time · Findings (None / error+warning counts). Rows expand to the same handshake panel as the issues table. **When total findings in scope are zero, this table is listed above the issues empty state** so clean captures still show browsable traffic. |
| Handshake panel      | Inline expansion of the clicked row. Two cards on a 2-column grid: **Request** (Origin only on regular CORS entries; Origin + ACR-Method + ACR-Headers on preflights, plus a "credentialed" badge when the actual request carries `Cookie` / `Authorization`) and **Response** (six ACA-\* headers). Below: the per-entry findings list with severity icons (`✗` / `⚠` / `•`) and the sent / expected / received detail triplet. |
| Preflight pairs      | Collapsible `<details>` listing every `CorsPair`. Each card shows a verdict pill (**OK** / **Warnings** / **Preflight failed** / **Actual blocked** / **No actual request**), the source-file chip, the Δ start time between OPTIONS and actual, and two `border-l-2` rows: blue for the OPTIONS request and green for the actual request (or a red "no matching actual request found within 5000 ms" hint when unpaired).       |

**Discovery links:**

- Home page (`app/page.tsx`) — when `crossOriginCount > 0`, the **insight-strip CORS chip** (§3.2) and **Tools → CORS** link (§3.3) appear. Copy is severity-aware (errors / warnings / all clear); Tools shows error badge, warning badge, or **clear** label.
- Per-file page (`app/file/[index]/page.tsx`) — when the file has at least one cross-origin request, a **CORS →** link appears next to the file index, deep-linking to `/cors?file={index}`.
- Outbound to `/entry/[file]/[index]` — the issues table URL cell wraps in a `<Link>` (with `stopPropagation` so it doesn't toggle the row's expand), the handshake panel renders an **Open entry detail →** affordance above the request / response grid, and each preflight-pairs `PairRowLine` URL becomes a link (OPTIONS row always, Actual row only when `pair.actual !== null`). All three resolve via `CorsEntry.fileIndex` + `CorsEntry.entryIndex` already carried on the audit data.

### 4.13 Header & Cookie Search page (`/kv-search`)

A free-text search page over every kv pair carried by the loaded HAR entries — request headers, response headers, request cookies, and response cookies — backed by the pure engine in `utils/kvSearch.ts`. Designed as a triage tool: locate a specific header or cookie (by name, value, or both) across one or many files without re-opening DevTools.

**Pre-conditions and fallbacks:**

- **No files loaded** — page shows the standard "No HAR files loaded" message and a link back to upload.
- **Both inputs empty** — the results table renders an "Enter a name or value to search across request and response headers and cookies." placeholder. No work is done.
- **Invalid regex (mode = `regex`)** — the offending input gains a red border and an inline `Invalid regex: …` message; the results table renders empty (no entries) until the pattern compiles.
- **Regex timeout** — when a compiled pattern exceeds the per-haystack CPU budget (50 ms) or 1000 match iterations, the results table is empty and an inline `Pattern timed out — simplify the regex or narrow scope` message is shown for the offending side.

**URL state:**

| Parameter | Values                                                                                      | Default    |
| --------- | ------------------------------------------------------------------------------------------- | ---------- |
| `name`    | free-text needle for the kv pair name side (empty = wildcard)                               | `""`       |
| `value`   | free-text needle for the kv pair value side (empty = wildcard)                              | `""`       |
| `url`     | free-text needle for the entry URL pre-filter (empty = no URL narrowing)                    | `""`       |
| `scope`   | comma list of `rh` (req header) / `sh` (res header) / `rc` (req cookie) / `sc` (res cookie) | all four   |
| `mode`    | `contains` \| `exact` \| `regex`                                                            | `contains` |
| `cs`      | `1` (case-sensitive) \| absent (case-insensitive)                                           | absent     |
| `file`    | `all` \| file index `[0, fileCount)`                                                        | `all`      |
| `expand`  | `<harFileIndex>:<indexInFile>` of the row whose detail panel is open                        | `""`       |

`expand` values longer than **512 characters** are ignored (`parseExpandParam`).

Defaults are normalised out of the URL when serialised (e.g. all four scope tokens collapse to no `scope` param). All three text inputs (`name` / `value` / `url`) are debounced 150 ms before they update the URL.

**Match semantics:**

| Mode       | Behaviour                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `contains` | Substring search. Returns every non-overlapping occurrence (used for highlighting).                        |
| `exact`    | Whole-string match against the kv field. Returns a single full-span match when it hits.                    |
| `regex`    | JS `RegExp` (flags `g` or `gi`) evaluated against the kv field. Invalid pattern → inline warning, no hits. Exceeds 50 ms / 1000 matches per haystack → timeout warning, no hits. |

- **Same-pair AND** — when both `name` and `value` are supplied, both must match the **same** header/cookie entry (not just somewhere in the same HTTP request). An empty side is treated as a wildcard for that side.
- **URL pre-filter** — `url` is an entry-level `contains` filter that is **always case-insensitive** and never honours `mode` / `cs` (those govern only the name / value kv matchers). Entries whose `entry.url` does not contain the needle are skipped before any kv matching runs. The filter composes as AND with name / value, and **alone is not a result driver** — when both `name` and `value` are empty the results table stays empty regardless of `url` (matches the "no needle = no results" rule).
- **Case sensitivity** — `cs=1` flips both name and value to case-sensitive. Cookie / header names in HTTP are case-insensitive by convention; the default matches that practical behaviour.
- **Highlight spans** — `compileMatcher(...).run(...)` returns the list of `MatchRange`s in each haystack. The expanded panel renders them via `<mark>` so the user sees exactly which substring(s) caused the hit.

**Sections (in order):**

| Section        | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search bar     | `Name` + `Value` text inputs and a full-width `URL contains` input (all three debounced 150 ms). Four scope chips with `aria-pressed` colored by location (req-header blue, res-header indigo, req-cookie amber, res-cookie pink). Mode `<select>` (Contains / Exact / Regex). Case-sensitive checkbox. File `<select>` shown when ≥ 2 files loaded.                                                                                                                                                    |
| Summary line   | `<totalHits> entries matched · <totalMatches> kv matches <scope label>` plus a per-location chip breakdown of the matched-pair counts.                                                                                                                                                                                                                                                                                                                                                                  |
| Results table  | One row per matching entry. Columns: ▸ (expand) · File · Method · Status · URL · # matches · Timestamp (UTC). **Paginated at 50 rows per page** with Prev / Next when needed; `?expand=` jumps to the page containing that row. Row click toggles `?expand=<entryId>`. The URL cell renders the entry's pathname as a deep link to `/compare?url=<entry.url>` — the per-URL summary page — with `stopPropagation` so the link navigates without toggling the row. The Timestamp column formats `entry.startedDateTime` via `toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC'`, matching `/header-diff`'s entry list. |
| Expanded panel | Inline expansion below the clicked row: full URL (a deep link to `/entry/<harFileIndex>/<indexInFile>`, threaded down from `ResultsTable` so the link points at the specific hit rather than every entry sharing the URL) plus a list of every matching kv pair. Each item carries a colored location chip + name + `:` + value, with matched spans wrapped in `<mark>`.                                                                                                                                |

**Discovery links:**

- Home page (`app/page.tsx`) — **Search headers/cookies** in the Tools row (§3.3) whenever at least one file is loaded.
- Per-file page (`app/file/[index]/page.tsx`) — a **Search Headers/Cookies →** link appears next to the file index, deep-linking to `/kv-search?file={index}`. Always visible (every file has headers).
- `/cors` handshake panel — every CORS header name in the Request / Response cards is a deep link to `/kv-search?name=<header>&scope=rh|sh&file=<index>` so the audit row can be jumped into the search page pre-scoped to the relevant file and side.

### 4.14 Sorting

- Clicking a column header sorts by that field ascending; clicking again toggles descending.
- Active sort column is highlighted with a directional arrow indicator.
- Sort state resets to the default when the search query changes.

### 4.15 Pagination

- Flat entry tables (status and content type views) are paginated at 50 rows per page.
- `/kv-search` results and `/cors` CORS requests inventory use the same 50-row page size.
- Previous / Next controls and a "current / total" (or range) indicator are shown when more than one page exists.
- Page resets to 1 when the search query or filter set changes (`?expand=` may jump to a later page on load).

### 4.16 Single-entry detail page (`/entry/[file]/[index]`)

Deep-dive view for a specific HAR entry, identified by two zero-based dynamic segments: `[file]` = `harFileIndex` (which loaded HAR), `[index]` = position inside that file's `analysis.entries` array. No query-string state — the URL segments fully identify the entry.

Backed by the pure helpers in `utils/entryStats.ts`:

- `getEntryByPosition(store, fileIndex, indexInFile)` — bounds-checked store → `EntryRecord` lookup; returns `null` on out-of-range / missing store.
- `compareEntryToFile(entry, file)` — ranks an entry against the rest of its file: `samples`, `p50` / `p95` / `p99` time, `medianSize`, `p90Size`, `timeRank` (`faster-than-p50` / `between-p50-p95` / `slower-than-p95` / `slower-than-p99`), and `sizeRank` (`below-median` / `above-median` / `top-decile`).
- `parseUrlQuery(url)` — splits a URL into `{ name, value }[]` query pairs (URL-decoded, preserves repeats, tolerates malformed inputs).
- `findHeader(headers, name)` — case-insensitive header lookup.
- `findIndexInFile(analysis, entry)` — back-link from an `EntryRecord` reference to its `analysis.entries` index.
- `throughputKBps(entry)` — `contentSize / time` expressed in KB/s when both are non-zero, else `null`.
- `reusedConnection(timings)` — `true` when **both** `normalizeTiming(timings.dns)` and `normalizeTiming(timings.connect)` collapse to `0` (HAR's `-1` "N/A" sentinel and any non-positive value normalize to `0`). `ssl` is intentionally excluded because TLS resumption (session tickets / 0-RTT) varies independently of socket reuse; the chip is a strict "this request skipped DNS + TCP" signal, matching Chrome DevTools' waterfall conflation.

**Sections (in order):**

| Section          | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title block      | Method · `StatusBadge` · full URL · originating file name + index · started timestamp (UTC).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Summary card     | KPI strip: total time · content size · content type · transferred bytes · throughput (when computable) · connection-reuse hint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Performance card | Stacked timing bar reusing `components/timingPhases.ts`. Phase grid showing each phase ms + share-of-total. `Blocked` row when present. **Context strip** that places this entry's `time` and `contentSize` against the file's P50 / P95 / P99 time and median / P90 size, with tinted chips driven by `timeRank` / `sizeRank` (`faster-than-p50` green → `slower-than-p99` red). A **HintsRow** of always-rendered chips: green `Reused connection` vs. slate `New connection` (driven by `reusedConnection(timings)` — see helper definition above), `<KB/s>` throughput (when `throughputKBps` is non-null), `Cache-Control: <value>` (when the response header is present), and `X-From-Cache: <value>` (when the proxy/SW header is present). |
| Request card     | Three subsections (Headers · Cookies · Query string). Headers table sortable a–z (column header toggle: HAR order ↔ case-insensitive a–z). Cookies and query string share the same `CookieTable` component.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Response card    | Headers + Cookies subsections plus a `Set-Cookie (raw)` subsection that lists original response-header values verbatim when the entry sets cookies — preserves `Path` / `HttpOnly` / `Max-Age` / `SameSite` attributes the parsed list strips.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Content card     | `<pre>` rendering of `responseContent` capped at 50 000 chars. Body loaded on demand via `useEntryBody` when not in memory (§1.5). **Binary MIME** (`isBinaryMimeType`) with captured body → “body not displayed”; **no captured text** → “not captured” copy (mentions wire size when `content.size` > 0). When the body exceeds the cap, a `Show full` ↔ `Show truncated` toggle is exposed. A `CopyButton` uses `navigator.clipboard.writeText` on the **full** body (silently no-ops on insecure contexts). |

**Fallback matrix:**

| Condition                                               | Behavior                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Store still loading                                     | Loading state from `useHarStore`.                                                                                 |
| Store empty or `analyses.length === 0`                  | `NotFound` shell with "No HAR loaded" message + link back to `/`.                                                 |
| `fileIndex` or `indexInFile` non-numeric / out-of-range | `getEntryByPosition` returns `null` → `NotFound` shell with "Entry not found".                                    |
| `analysis.entries.length < 2`                           | Performance card omits the context strip (no sample population to compare against) and shows the bar / grid only. |
| Binary / no-body                                        | Content card replaces `<pre>` with the italic placeholder ("Binary content — body not displayed" / "No body").    |

**Discovery links:**

- Per-file page (`app/file/[index]/page.tsx`) — the main paginated entry list's URL cell links to `/entry/{harFileIndex}/{indexInFile}` (the top-10 slowest/largest summary tables keep their `/compare?url=…` cross-file link).
- `/compare` (`app/compare/page.tsx`) — every expanded per-entry header row carries a `Detail →` link to `/entry/{harFileIndex}/{indexInFile}` (uses `stopPropagation` so it doesn't toggle the expand panel).
- `/kv-search` (`app/kv-search/page.tsx`) — the full URL inside the expanded panel deep-links to `/entry/{harFileIndex}/{indexInFile}` (see §4.13).
- `/cors` (`app/cors/page.tsx`) — issues table URL cell, handshake panel **Open entry detail →** affordance, and preflight-pair URL rows all deep-link to `/entry/{fileIndex}/{entryIndex}` (see §4.12).

---

## 5. Data Flow

```
Browser FileReader API  (or Web Worker when enabled — §1.3b)
       │
       ▼
  parseHarFile() / parseAndAnalyzeHarFile()
       │
       ▼
   analyzeHar()         — HarFile → HarAnalysis (aggregates + EntryRecord[])
       │
       ├── optional redactAnalysis()  — when §1.3c toggle enabled (headers/cookies/URL params + strip bodies)
       │
       ▼
  buildHarStore()       — HarAnalysis[] → HarStore (version 2)
       │
       ▼
  saveHarStoreAsync()   — when redaction on: delete cold body keys + strip bodies;
                          hot blob + separate body keys → IndexedDB
       │
  (on navigation)
       │
       ▼
  loadHarStoreAsync()   — IndexedDB → HarStore (legacy v1 migrate on read)
       │
       ├── Home page             — computeHomeInsights() → InsightStrip + Tools
       │
       ├── Details page filters  — filterEntriesBySearch + type/value filters
       │
       ├── Content Diff page     — pathKey() / filterEntriesBySelection()
       │                            (pathname across hosts; query ignored)
       │                            → useEntryBody → truncateBody()
       │                            → prettifyIfJson() → computeDiff()
       │                            → UnifiedDiffView / SideBySideDiffView
       │                            (binary / no-body fallback:
       │                             sha256Hex() per side → BinaryHashCompare)
       │
       ├── Header Diff page      — same pathname selection as Content Diff
       │                            → two EntryRecord header/cookie arrays
       │                            → diffKvPairs() × 4 → HeaderDiffView
       │
       ├── MIME mismatch page        — analyzeStore(analyses) → MimeMismatchReport
       │                            → filter by file / unverified toggle
       │
       ├── Cache validator page      — analyzeStore(analyses) → path groups
       │                            → ETag / Last-Modified drift by pathname
       │
       ├── Anomalies hub + categories— analyzeStore(analyses) → status/size/
       │                            encoding/cache-policy path groups
       │
       ├── CORS page               — analyzeStore(analyses) → CorsReport
       │                            → IssuesTable + CorsRequestsTable
       │                            + HandshakePanel + PreflightPairsSection
       │
       ├── KV Search page          — EntryRecord[] (scoped by `?file=`)
       │                            → compileMatcher(name|value, mode, cs)
       │                            → searchEntries() → paginated ResultsTable
       │
       └── Entry detail page       — getEntryByPosition(store, fileIndex, indexInFile)
                                    → useEntryBody(entry) when needed
                                    → compareEntryToFile(entry, file)
                                    → SummaryCard + PerformanceCard
                                    + RequestCard + ResponseCard + ContentCard
```

All routes share **`PageShell`** (`AppHeader`, back link, crumb) and common empty/loading states.

---

## 6. Non-Functional Requirements

| Concern        | Approach                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy        | All processing is client-side; no network requests are made with HAR data. First-visit banner + opt-in credential redaction before IDB save (§1.3c); response bodies omitted from cold storage when redaction is on. §1.3d hardening: `?expand=` cap, kv-search regex budget, http(s)-only external links on `/compare`. |
| Performance    | Default parse on main thread via `FileReader`; optional worker for large files (§1.3b). Response bodies split to cold IDB keys (§1.5) to keep the hot blob small. Derived entry arrays are memoized to avoid recomputation on unrelated re-renders. |
| Storage limits | IndexedDB v2: metadata hot blob + per-body cold keys; quota errors surface inline on save. Legacy v1 stores migrate on load when possible.                                    |
| Accessibility  | Semantic HTML table elements; keyboard-navigable sort headers and pagination controls                                                                                        |
| Responsiveness | Horizontally scrollable tables on narrow viewports; shared shell with sticky header across tool pages                                                                          |
| Testing        | `npm test` runs Vitest unit + RTL smoke tests (324+ at v0.2.0); `fixture-audits.har` covered in `__tests__/fixtureAudits.test.ts` |
| Toolchain      | Tailwind CSS 4.3.3 via `@tailwindcss/postcss`; Node 22 LTS for production deploy (`Dockerfile`, `deploy-vm.sh`); Tailwind ≥ 4.3.1 on Node 26+ avoids `DEP0205` build deprecation noise |

---

## 7. Out of Scope

- Server-side storage or sharing of HAR data
- Waterfall / timeline visualizations
- HAR file export or diff output
- Authentication
