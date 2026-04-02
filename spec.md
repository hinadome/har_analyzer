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
- If `localStorage` quota is exceeded during save, the user sees an error explaining the cause.
- Errors are displayed inline below the upload zone and do not block subsequent uploads.

### 1.4 File management
- Each loaded file is shown as a chip displaying the file name and request count.
- Individual files can be removed via the × button on their chip; indices are recomputed on removal.
- "Clear all" removes all files and clears persisted storage.

### 1.5 Persistence
- Parsed analysis data is serialized to `localStorage` under the key `har_analyzer_data`.
- On page load, any previously stored data is restored automatically.

---

## 2. HAR Parsing

### 2.1 Fields extracted per entry
| Field | Source in HAR |
|---|---|
| URL | `entry.request.url` |
| HTTP method | `entry.request.method` |
| Status code | `entry.response.status` |
| Status text | `entry.response.statusText` |
| Content type | `entry.response.content.mimeType` (normalized, see 2.2) |
| Content size | `entry.response.content.size` |
| Body size | `entry.response.bodySize` |
| Response time | `entry.time` (ms) |
| Request headers | `entry.request.headers` |
| Response headers | `entry.response.headers` |
| Request cookies | `entry.request.cookies` (falls back to parsing `Cookie` header) |
| Response cookies | `entry.response.cookies` (falls back to parsing `Set-Cookie` headers) |
| Server IP | `entry.serverIPAddress` |
| Timing phases | `entry.timings`: `dns`, `connect`, `ssl`, `send`, `wait`, `receive`, `blocked` (optional phases use `-1` when not applicable) |

### 2.2 HAR timing model

The HAR spec defines **two separate timing concepts**. This app uses only the per-request one.

**`entry.timings`** (used) — phase breakdown for each individual HTTP request:

| Phase | What it measures | Optional? |
|---|---|---|
| `blocked` | Time queued before the connection could start (browser connection limit, cache check) | Yes — `-1` if N/A |
| `dns` | DNS lookup time | Yes — `-1` if address was cached or connection was reused |
| `connect` | TCP handshake time | Yes — `-1` if keep-alive connection was reused |
| `ssl` | TLS negotiation time (overlaps with `connect` on HTTPS) | Yes — `-1` if HTTP or connection was reused |
| `send` | Time to transmit the request body to the server | No |
| `wait` | **TTFB** — time from request sent to first byte of response (server think time) | No |
| `receive` | Time to download the response body | No |

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

| Row | Value shown | Clickable? |
|---|---|---|
| Total Requests | Integer count per file | No |
| Unique URLs | Integer count per file | Yes — links to `/details?type=url` |
| *[status code]* (one row per unique code across all files) | Count per file, `—` if absent | Yes — links to `/details?type=status&value={code}` |
| *[content type]* (one row per unique type across all files) | Count per file, `—` if absent | Yes — links to `/details?type=contentType&value={encoded}` |
| Total Response Size | Human-readable byte total per file | No |
| *[size bucket]* (`0 B – 1 KB`, `1 KB – 10 KB`, `10 KB – 100 KB`, `100 KB – 1 MB`, `1 MB+`) | Count per file, `—` if absent | Yes — links to `/details?type=contentSizeBucket&value={encoded}` |

### 3.3 Section headers
- "Status Codes", "Content Types", and "Content Size" section headers span all columns and visually separate the groups.

### 3.4 Status code color coding (row labels)
| Range | Color |
|---|---|
| 2xx | Green |
| 3xx | Yellow |
| 4xx | Orange |
| 5xx | Red |
| Other | Slate |

---

## 4. Details Pages

All detail views live at `/details` and are distinguished by query parameters:

| Parameter | Values |
|---|---|
| `type` | `status` \| `url` \| `contentType` \| `contentSizeBucket` |
| `value` | Status code integer, URL-encoded content type string, or URL-encoded size bucket label (e.g. `1+KB+%E2%80%93+10+KB`); omitted for `type=url` |

### 4.1 Common elements
- Back link returning to `/`
- Page title describing the filter dimension and value
- Entry count / URL count summary line
- Search/filter input that performs case-insensitive substring matching across URL, content type, status code, and file name fields

### 4.2 Status code detail (`type=status`)
Displays a sortable table of all entries across all files whose `response.status` matches `value`.

Columns:

| Column | Sortable | Notes |
|---|---|---|
| URL | Yes | Truncated to 80 chars, full URL on hover; opens in new tab |
| Status | Yes | Color-coded badge; links to status detail for that code |
| Content Type | Yes | Links to content type detail |
| Size | Yes | Human-readable (B / KB / MB) |
| Time | Yes | Human-readable (ms / s) |
| HAR File | Yes | Truncated with title tooltip |

### 4.3 Content type detail (`type=contentType`)
Same table structure as status code detail, filtered to entries whose normalized content type equals `value`.

### 4.4 Content size bucket detail (`type=contentSizeBucket`)
Same table structure as status code detail, filtered to entries whose `response.content.size` falls within the selected size range. Page title displays "Content Size: {bucket label}" (e.g. "Content Size: 1 KB – 10 KB").

Size bucket boundaries:

| Bucket label | Range |
|---|---|
| `0 B – 1 KB` | 0 – 1,023 bytes |
| `1 KB – 10 KB` | 1,024 – 10,239 bytes |
| `10 KB – 100 KB` | 10,240 – 102,399 bytes |
| `100 KB – 1 MB` | 102,400 – 1,048,575 bytes |
| `1 MB+` | ≥ 1,048,576 bytes |

### 4.5 URL detail (`type=url`)
Displays entries grouped by URL rather than a flat list.

**Summary table columns:**

| Column | Notes |
|---|---|
| (expand toggle) | ▶ / ▼ |
| URL | Truncated to 80 chars |
| Total Hits | Sum across all files |
| *[file name]* (one column per loaded file) | Hit count for that file, blank if zero |
| Avg Size | Average `contentSize` across all entries for this URL |
| Avg Time | Average `time` across all entries for this URL |

**Expanded row:**
Clicking a URL row expands an inline sub-table showing each individual entry with: HAR file, status badge (links to status detail), content type (links to content type detail), size, time.

### 4.6 Per-file performance dashboard (`/file/[index]`)

Displays a performance summary for a single loaded HAR file.

**Sections:**

| Section | Content |
|---|---|
| Performance Summary | P50, P95, P99 response times; error rate (4xx/5xx %); total transferred bytes |
| Slowest Requests | Top 10 entries by `time`, shown with URL, duration, and a proportional bar; links to compare page |
| Largest Resources | Top 10 entries by `contentSize`, shown with URL, size, and a proportional bar; links to compare page |
| Avg Timing Breakdown | Stacked bar + legend grid showing average DNS, Connect, SSL, Send, TTFB (wait), and Receive time across all requests; phases < 0.5% share are hidden from the bar. Calculated as `sum(phase_ms across all entries) / n`, with HAR `-1` values treated as 0. `blocked` is excluded from this display. |

### 4.7 Per-URL comparison page (`/compare?url={encoded}`)

Displays all recorded entries for a specific URL grouped by HAR file, enabling cross-file comparison.

**Per-file summary row**: HAR file name, hit count, observed status codes, content types, avg/min/max response time, avg size, server IPs, user agents. Expandable to show individual entries.

**Expanded entry detail** — clicking an individual request shows a tabbed panel:

| Tab | Content |
|---|---|
| Request | Request headers table + request cookies table |
| Response | Response headers table + response cookies table |
| Timing | Per-request timing breakdown: stacked bar (DNS → Connect → SSL → Send → TTFB → Receive) + phase grid showing ms value and % of total for each phase. Calculated as `phase_ms / sum(all phases)` for a single entry, with HAR `-1` values treated as 0. `blocked` is excluded from this display. Phases < 0.5% of total are hidden from the bar but shown in the grid. Shows "No timing data available" when all phases sum to zero (e.g. fully cached responses). |

**All-entries flat table**: Below the per-file sections, a sortable paginated table lists every entry for the URL across all files with columns for HAR file, status, content type, size, and time.

### 4.8 Sorting
- Clicking a column header sorts by that field ascending; clicking again toggles descending.
- Active sort column is highlighted with a directional arrow indicator.
- Sort state resets to the default when the search query changes.

### 4.9 Pagination
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
  saveHarStore()        — HarStore → localStorage
       │
  (on navigation)
       │
       ▼
  loadHarStore()        — localStorage → HarStore
       │
       ▼
  Details page filters  — HarStore.allEntries filtered by type/value
```

---

## 6. Non-Functional Requirements

| Concern | Approach |
|---|---|
| Privacy | All processing is client-side; no network requests are made with HAR data |
| Performance | Parsing runs in the main thread via `FileReader`; large files may cause brief UI blocking |
| Storage limits | `localStorage` is typically capped at 5–10 MB; oversized payloads produce a user-visible error |
| Accessibility | Semantic HTML table elements; keyboard-navigable sort headers and pagination controls |
| Responsiveness | Horizontally scrollable tables on narrow viewports |

---

## 7. Out of Scope

- Server-side storage or sharing of HAR data
- Waterfall / timeline visualizations
- Request body or response body inspection
- HAR file export or diff output
- Authentication
