# HAR Analyzer — Functional Specification

## Overview

HAR Analyzer is a client-side web application that ingests one or more HAR (HTTP Archive) files, parses them in the browser, and presents a comparative summary alongside drill-down detail views. All processing happens locally; no data is sent to a server.

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

### 1.4 File management

- Each loaded file is shown as a chip displaying the file name and request count.
- Individual files can be removed via the × button on their chip; indices are recomputed on removal.
- "Clear all" removes all files and clears persisted storage.

### 1.5 Persistence

- Parsed analysis data is serialized to `IndexedDB` to circumvent quota limits present in local storage.
- On page load, any previously stored data is restored automatically.

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
| Response Content | `entry.response.content.text`                                                                                                 |
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

### 2.5 Per-file aggregates computed

- `totalRequests` — total entry count
- `totalContentSize` — sum of `entry.response.content.size` across all entries (bytes)
- `statusCodeCounts` — map of `{ statusCode: count }`
- `contentTypeCounts` — map of `{ normalizedMimeType: count }`
- `contentSizeBucketCounts` — map of `{ bucketLabel: count }` using five ranges: `0 B – 1 KB`, `1 KB – 10 KB`, `10 KB – 100 KB`, `100 KB – 1 MB`, `1 MB+`
- `uniqueUrlCount` — count of distinct URL strings

---

## 3. Comparison Table

Displayed after at least one file is loaded.

### 3.1 Structure

- One column per loaded HAR file, with the file name as the column header (truncated with a tooltip if long).
- Rows grouped into four sections: totals, status codes, content types, and content size.

### 3.2 Rows

| Row                                                                                        | Value shown                        | Clickable?                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| Total Requests                                                                             | Integer count per file             | No                                                               |
| Unique URLs                                                                                | Integer count per file             | Yes — links to `/details?type=url`                               |
| _[status code]_ (one row per unique code across all files)                                 | Count per file, `—` if absent      | Yes — links to `/details?type=status&value={code}`               |
| _[content type]_ (one row per unique type across all files)                                | Count per file, `—` if absent      | Yes — links to `/details?type=contentType&value={encoded}`       |
| Total Response Size                                                                        | Human-readable byte total per file | No                                                               |
| _[size bucket]_ (`0 B – 1 KB`, `1 KB – 10 KB`, `10 KB – 100 KB`, `100 KB – 1 MB`, `1 MB+`) | Count per file, `—` if absent      | Yes — links to `/details?type=contentSizeBucket&value={encoded}` |

### 3.3 Section headers

- "Status Codes", "Content Types", and "Content Size" section headers span all columns and visually separate the groups.

### 3.4 Status code color coding (row labels)

| Range | Color  |
| ----- | ------ |
| 2xx   | Green  |
| 3xx   | Yellow |
| 4xx   | Orange |
| 5xx   | Red    |
| Other | Slate  |

---

## 4. Details Pages

All detail views live at `/details` and are distinguished by query parameters:

| Parameter | Values                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | `status` \| `url` \| `contentType` \| `contentSizeBucket` \| `serverIPAddress` \| `userAgent`                                                        |
| `value`   | Status code integer, URL-encoded content type string, URL-encoded size bucket label, server IP address, or user agent string; omitted for `type=url` |

### 4.1 Common elements

- Back link returning to `/`
- Page title describing the filter dimension and value
- Entry count / URL count summary line
- Search/filter input that performs case-insensitive substring matching across URL, content type, status code, and file name fields

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

**Per-file summary row**: HAR file name, hit count, observed status codes, content types, avg/min/max response time, avg size, server IPs, user agents. Expandable to show individual entries.

**Expanded entry detail** — clicking an individual request shows a tabbed panel:

| Tab      | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request  | Request headers table + request cookies table                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Response | Response headers table + response cookies table                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Timing   | Per-request timing breakdown: stacked bar (DNS → Connect → SSL → Send → TTFB → Receive) + phase grid showing ms value and % of total for each phase. Calculated as `phase_ms / sum(all phases)` for a single entry, with HAR `-1` values treated as 0. `blocked` is excluded from this display. Phases < 0.5% of total are hidden from the bar but shown in the grid. Shows "No timing data available" when all phases sum to zero (e.g. fully cached responses). |
| Content  | Response text body block                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**All-entries flat table**: Below the per-file sections, a sortable paginated table lists every entry for the URL across all files with columns for HAR file, start time, status, content type, size, and time.

### 4.8 Content Diff page (`/content-diff?url={encoded}`)

Enables response body comparison between any two entries for the same URL (or same base path when query strings are ignored).

**URL search:**

- Free-text input with live filtering against all unique URLs in the loaded HAR data (case-insensitive substring match).
- Dropdown groups results by base path (scheme + host + pathname). When "Ignore query string" is on, each group header shows the base path and lists all distinct full URLs beneath it as sub-items. Selecting the group header loads all entries sharing that base path; selecting a specific full URL loads only exact-match entries.
- Pre-populated from the `?url=` query parameter when navigating from the compare page.

**Ignore query string toggle:**

- When enabled, entry matching uses the base path only (strips `?` and `#`), so requests to the same endpoint with different query params are grouped together.
- The selected URL banner displays a "query strings ignored" label when the toggle is on.

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
| Timestamp (UTC) | `startedDateTime` formatted as UTC                                 |
| —               | "binary" badge for binary or uncaptured entries                    |

Each request to the same URL within a single HAR file appears as a separate selectable row.

**Diff panel** (shown when two different entries are selected):

| Element                 | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata bar            | Shows both selected entries (file name, URL, status, timestamp) side by side above the diff                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Mode toggle             | Switch between Unified and Side-by-Side diff layouts; defaults to Unified                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Identical banner        | Green banner shown when both response bodies match exactly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| JSON prettified label   | Shown when `application/json` or `+json` content was auto-formatted before diffing                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Truncation notice       | Amber notice per entry when body exceeds 50,000 characters; "Show full content" / "Show less" toggle per entry                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Unified diff            | Single scrollable panel; removed lines in red with `−` prefix, added lines in green with `+` prefix; line numbers in gutter                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Side-by-side diff       | Two panels (Baseline left, Compare right); placeholder rows maintain alignment; line numbers in each gutter                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Intra-line highlighting | Changed lines show character/word-level spans highlighting the exact text that was added or removed                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Binary fallback         | When either entry is binary or has no captured body: byte sizes plus SHA-256 hash of each side's `responseContent` (Web Crypto, `crypto.subtle.digest("SHA-256", …)`) shown side-by-side as 64-char lowercase hex digests, with a status banner reporting **Identical (matching SHA-256)**, **Different (SHA-256 mismatch)**, **Computing SHA-256…**, **No body captured for {baseline \| compare \| either entry}** when `responseContent` is missing, or **Hash error: …** when `crypto.subtle` is unavailable; no line-by-line diff rendered |

### 4.9 Header Diff page (`/header-diff?url={encoded}`)

Enables comparison of request/response headers and cookies between any two entries for the same URL (or same base path when query strings are ignored). Follows the same URL search and entry selection pattern as the Content Diff page (§4.8).

**URL search and entry selection:** identical to §4.8 — free-text input, grouped dropdown with base path headers and full URL sub-items, "Ignore query string" toggle, pre-population from `?url=` query parameter.

**Entry table columns:**

| Column          | Notes                                       |
| --------------- | ------------------------------------------- |
| Baseline        | Radio button                                |
| Compare         | Radio button                                |
| HAR File        | File name (font-mono, truncated)            |
| URL             | Full URL; links to `/compare?url={encoded}` |
| Status          | Color-coded status badge                    |
| Req/Res Headers | Count of request headers / response headers |
| Req/Res Cookies | Count of request cookies / response cookies |
| Timestamp (UTC) | `startedDateTime` formatted as UTC          |

**Diff panel** (shown when two different entries are selected):

| Element            | Behaviour                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Metadata bar       | Shows both selected entries (file name, URL, status, timestamp) side by side above the diff |
| Identical banner   | Green banner when all four sections match exactly                                           |
| Four diff sections | Request Headers, Response Headers, Request Cookies, Response Cookies                        |

**Key-value diff table** (one per section):

| Row style                    | Meaning                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Red background, `−` prefix   | Header/cookie present only in baseline (removed)                                                   |
| Green background, `+` prefix | Header/cookie present only in compare (added)                                                      |
| Amber background, `~` prefix | Present in both but value changed; baseline value shown with strikethrough, compare value in green |
| No highlight                 | Equal in both entries                                                                              |

**Diffing rules:**

- Header names are compared case-insensitively (per HTTP spec); values are compared case-sensitively.
- When a header name appears multiple times on one side, occurrences are matched positionally against the same-named occurrences on the other side.
- Extra occurrences on either side are shown as added or removed.

### 4.10 Cross-file Performance Dashboard (`/performance`)

Multi-file performance overview that lays every loaded HAR file out side by side. Linked from the Comparison Summary header on the home page once at least one file is loaded.

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

### 4.12 CORS Audit page (`/cors`)

Cross-Origin Resource Sharing diagnostic dashboard backed by the pure analyzer in `utils/corsAnalysis.ts`. Runs across every loaded HAR file, surfacing potential CORS failures and warnings with enough context (handshake headers, preflight pairing) to triage them without re-opening DevTools. Discovery links appear on the home page and on each per-file page when the relevant file has at least one cross-origin request.

**Pre-conditions and fallbacks:**

- **No files loaded** — page shows the standard "No HAR files loaded" message and a link back to upload.
- **No cross-origin traffic** — KPI cards render with zeros; the issues table renders an "All cross-origin requests in scope passed the audit" placeholder.

**URL state:**

| Parameter  | Values                                  | Default |
| ---------- | --------------------------------------- | ------- |
| `file`     | `all` \| file index `[0, fileCount)`    | `all`   |
| `severity` | `all` \| `error` \| `warning` \| `info` | `all`   |
| `origin`   | one of the request `Origin` values seen | `""`    |
| `expand`   | `<fileIndex>:<entryIndex>`              | `""`    |

`expand` deep-links to a specific entry: when present on initial load, the matching row is pre-expanded and scrolled into view.

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

| Section         | Content                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope bar       | File chips (All files + per-file with palette dot and finding count) + severity chips (All / Error / Warning / Info) + an Origin `<select>` rendered when more than one Origin is present. All bound to URL state.                                                                                                                                                                                                               |
| KPI summary     | Four cards: **Total findings** (with `error / warning / info` sub-line), **Failed preflights** (`failedPreflightCount` / total preflights), **Slow preflights** (count of `preflight-slow` findings, `> 1000 ms`), **Cross-origin requests** (non-preflight cross-origin entries with the `Origin` header).                                                                                                                      |
| Issues table    | Flat one-row-per-finding table (sorted error → warning → info). Columns: Severity · Kind · File (in `all` scope) · Status · Method (with `PF` chip on preflights) · URL · Time · Detail. Rows are click-to-expand and toggle `?expand=<entryId>`.                                                                                                                                                                                |
| Handshake panel | Inline expansion of the clicked row. Two cards on a 2-column grid: **Request** (Origin only on regular CORS entries; Origin + ACR-Method + ACR-Headers on preflights, plus a "credentialed" badge when the actual request carries `Cookie` / `Authorization`) and **Response** (six ACA-\* headers). Below: the per-entry findings list with severity icons (`✗` / `⚠` / `•`) and the sent / expected / received detail triplet. |
| Preflight pairs | Collapsible `<details>` listing every `CorsPair`. Each card shows a verdict pill (**OK** / **Warnings** / **Preflight failed** / **Actual blocked** / **No actual request**), the source-file chip, the Δ start time between OPTIONS and actual, and two `border-l-2` rows: blue for the OPTIONS request and green for the actual request (or a red "no matching actual request found within 5000 ms" hint when unpaired).       |

**Discovery links:**

- Home page (`app/page.tsx`) — when `analyzeStore(...).crossOriginCount > 0`, a **CORS Audit** pill appears in the Comparison Summary button group. When `errorCount > 0`, the pill carries a small red badge with the error count.
- Per-file page (`app/file/[index]/page.tsx`) — when the file has at least one cross-origin request, a **CORS Audit →** link appears next to the file index, deep-linking to `/cors?file={index}`.

### 4.13 Header & Cookie Search page (`/kv-search`)

A free-text search page over every kv pair carried by the loaded HAR entries — request headers, response headers, request cookies, and response cookies — backed by the pure engine in `utils/kvSearch.ts`. Designed as a triage tool: locate a specific header or cookie (by name, value, or both) across one or many files without re-opening DevTools.

**Pre-conditions and fallbacks:**

- **No files loaded** — page shows the standard "No HAR files loaded" message and a link back to upload.
- **Both inputs empty** — the results table renders an "Enter a name or value to search across request and response headers and cookies." placeholder. No work is done.
- **Invalid regex (mode = `regex`)** — the offending input gains a red border and an inline `Invalid regex: …` message; the results table renders empty (no entries) until the pattern compiles.

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

Defaults are normalised out of the URL when serialised (e.g. all four scope tokens collapse to no `scope` param). All three text inputs (`name` / `value` / `url`) are debounced 150 ms before they update the URL.

**Match semantics:**

| Mode       | Behaviour                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `contains` | Substring search. Returns every non-overlapping occurrence (used for highlighting).                        |
| `exact`    | Whole-string match against the kv field. Returns a single full-span match when it hits.                    |
| `regex`    | JS `RegExp` (flags `g` or `gi`) evaluated against the kv field. Invalid pattern → inline warning, no hits. |

- **Same-pair AND** — when both `name` and `value` are supplied, both must match the **same** header/cookie entry (not just somewhere in the same HTTP request). An empty side is treated as a wildcard for that side.
- **URL pre-filter** — `url` is an entry-level `contains` filter that is **always case-insensitive** and never honours `mode` / `cs` (those govern only the name / value kv matchers). Entries whose `entry.url` does not contain the needle are skipped before any kv matching runs. The filter composes as AND with name / value, and **alone is not a result driver** — when both `name` and `value` are empty the results table stays empty regardless of `url` (matches the "no needle = no results" rule).
- **Case sensitivity** — `cs=1` flips both name and value to case-sensitive. Cookie / header names in HTTP are case-insensitive by convention; the default matches that practical behaviour.
- **Highlight spans** — `compileMatcher(...).run(...)` returns the list of `MatchRange`s in each haystack. The expanded panel renders them via `<mark>` so the user sees exactly which substring(s) caused the hit.

**Sections (in order):**

| Section        | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search bar     | `Name` + `Value` text inputs and a full-width `URL contains` input (all three debounced 150 ms). Four scope chips with `aria-pressed` colored by location (req-header blue, res-header indigo, req-cookie amber, res-cookie pink). Mode `<select>` (Contains / Exact / Regex). Case-sensitive checkbox. File `<select>` shown when ≥ 2 files loaded.                                                                                                                                                    |
| Summary line   | `<totalHits> entries matched · <totalMatches> kv matches <scope label>` plus a per-location chip breakdown of the matched-pair counts.                                                                                                                                                                                                                                                                                                                                                                  |
| Results table  | One row per matching entry. Columns: ▸ (expand) · File · Method · Status · URL · # matches · Timestamp (UTC). Row click toggles `?expand=<entryId>`. The URL cell renders the entry's pathname as a deep link to `/compare?url=<entry.url>` — the per-URL summary page — with `stopPropagation` so the link navigates without toggling the row. The Timestamp column formats `entry.startedDateTime` via `toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC'`, matching `/header-diff`'s entry list. |
| Expanded panel | Inline expansion below the clicked row: full URL (also a deep link to `/header-diff?url=<entry.url>`) plus a list of every matching kv pair. Each item carries a colored location chip + name + `:` + value, with matched spans wrapped in `<mark>`.                                                                                                                                                                                                                                                    |

**Discovery links:**

- Home page (`app/page.tsx`) — a **Search Headers/Cookies** pill appears in the Comparison Summary button group whenever at least one file is loaded (no count badge — this is a tool, not a problem detector).
- Per-file page (`app/file/[index]/page.tsx`) — a **Search Headers/Cookies →** link appears next to the file index, deep-linking to `/kv-search?file={index}`. Always visible (every file has headers).
- `/cors` handshake panel — every CORS header name in the Request / Response cards is a deep link to `/kv-search?name=<header>&scope=rh|sh&file=<index>` so the audit row can be jumped into the search page pre-scoped to the relevant file and side.

### 4.14 Sorting

- Clicking a column header sorts by that field ascending; clicking again toggles descending.
- Active sort column is highlighted with a directional arrow indicator.
- Sort state resets to the default when the search query changes.

### 4.15 Pagination

- Flat entry tables (status and content type views) are paginated at 50 rows per page.
- Previous / Next controls and a "current / total" indicator are shown when more than one page exists.
- Page resets to 1 when the search query changes.

---

## 5. Data Flow

```
Browser FileReader API
       │
       ▼
  parseHarFile()        — reads File → JSON → HarFile
       │
       ▼
   analyzeHar()         — HarFile → HarAnalysis (aggregates + EntryRecord[])
       │
       ▼
  buildHarStore()       — HarAnalysis[] → HarStore
       │
       ▼
  saveHarStore()        — HarStore → IndexedDB
       │
  (on navigation)
       │
       ▼
  loadHarStore()        — IndexedDB → HarStore
       │
       ├── Details page filters  — HarStore.allEntries filtered by type/value
       │
       ├── Content Diff page     — two EntryRecord bodies → truncateBody()
       │                            → prettifyIfJson() → computeDiff()
       │                            → UnifiedDiffView / SideBySideDiffView
       │                            (binary / no-body fallback:
       │                             sha256Hex() per side → BinaryHashCompare)
       │
       ├── Header Diff page      — two EntryRecord header/cookie arrays
       │                            → diffKvPairs() × 4 → HeaderDiffView
       │
       ├── CORS Audit page       — analyzeStore(analyses) → CorsReport
       │                            → pairPreflights() per file
       │                            → analyzeEntry() emits CorsFinding[]
       │                            → IssuesTable + HandshakePanel
       │                            + PreflightPairsSection
       │
       └── KV Search page         — EntryRecord[] (scoped by `?file=`)
                                    → compileMatcher(name|value, mode, cs)
                                    → searchEntries() → KvSearchOutcome
                                    → ResultsTable + ExpandedPanel
                                    (each KvMatch carries highlight ranges)
```

---

## 6. Non-Functional Requirements

| Concern        | Approach                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy        | All processing is client-side; no network requests are made with HAR data                                                                                                    |
| Performance    | Parsing runs in the main thread via `FileReader`; large files may cause brief UI blocking. Derived entry arrays are memoized to avoid recomputation on unrelated re-renders. |
| Storage limits | Used `IndexedDB` to handle massive payloads exceeding local storage caps; remaining caps trigger simple user visible error.                                                  |
| Accessibility  | Semantic HTML table elements; keyboard-navigable sort headers and pagination controls                                                                                        |
| Responsiveness | Horizontally scrollable tables on narrow viewports                                                                                                                           |

---

## 7. Out of Scope

- Server-side storage or sharing of HAR data
- Waterfall / timeline visualizations
- HAR file export or diff output
- Authentication
