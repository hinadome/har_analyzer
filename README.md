# HAR Analyzer

A browser-based tool for uploading, analyzing, and comparing multiple HAR (HTTP Archive) files side by side. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- Upload multiple `.har` files via drag-and-drop or file browser
- Comparison table showing request counts, status codes, unique URLs, content types, content size totals, and content size distribution per file
- Clickable status codes, URLs, content types, and content size ranges that link to detailed breakdowns
- Details pages with sortable, filterable, paginated entry tables
- URL details grouped by endpoint with per-file hit counts and expandable rows
- Per-file performance dashboard: P50/P95/P99 response times, slowest requests, largest resources, and avg timing breakdown (DNS → Connect → SSL → Send → TTFB → Receive)
- **Cross-file performance dashboard** (`/performance`) — every loaded file laid out side by side: per-file KPI matrix on shared bar scales, average timing-phase comparison, response-time distribution histogram with shared bucket axis, per-content-type performance table, and combined Slowest/Largest top-N lists
- **Pair diff dashboard** (`/performance/diff`) — pick a baseline and a compare file to see headline KPI Δs (with % change and tinted regression/improvement cues), per-phase timing deltas, an overlaid 2-color histogram, per-content-type Δ table, biggest movers by |Δtime| and |Δsize|, top-10 regressions and improvements, and "Only in Base" / "Only in Compare" unique-URL listings that deep-link into the per-file view filtered to that URL
- Per-URL comparison page showing each HAR file's entries side-by-side with expandable request detail including **Request headers**, **Response headers**, **Cookies**, **Timing**, and **Content** tabs
- Per-request timing breakdown: stacked bar chart and phase grid (DNS, Connect, SSL, Send, TTFB, Receive) shown when expanding any individual request
- **Content Diff page** — search for a URL, select any two entries, and view a line-by-line diff of their response bodies with intra-line character highlighting, JSON auto-prettification, unified and side-by-side modes, and an "ignore query string" toggle for grouping requests by base path. When either entry is binary (image, font, audio/video, octet-stream, zip, pdf) or has no captured body, the panel falls back to a SHA-256 hash comparison that reports whether the two responses are identical, different, or have no body captured
- **Header Diff page** — same URL search and entry selection as Content Diff, but diffs request headers, response headers, request cookies, and response cookies between two entries — showing added, removed, changed, and equal key-value pairs in a color-coded table
- **Header & Cookie Search page** (`/kv-search`) — free-text search over every header and cookie carried by the loaded HARs. Three needles (Name / Value / URL contains) with `contains` / `exact` / `regex` modes, case-sensitive toggle, four scope chips (req header / res header / req cookie / res cookie), and a file scope. Same-pair AND semantics; results table with click-to-expand highlighted match spans; the URL cell deep-links to `/compare`, and the expanded full URL deep-links to `/header-diff`
- **CORS Audit page** (`/cors`) — automated review of every cross-origin request in the loaded HARs. Detects nine finding kinds (failed/slow preflights, missing or mismatched `Access-Control-Allow-Origin`, wildcard ACAO with credentials, disallowed method, disallowed request header, missing `Access-Control-Allow-Credentials` flag, blocked actual request). KPI cards summarize totals, failed/slow preflights, and cross-origin counts; the issues table is filterable by file, severity, and Origin; clicking any row reveals a side-by-side request/response handshake panel with each finding's sent / expected / received triplet. A collapsible "Preflight pairs" section chains every OPTIONS request to its matching actual request within a 5 s window with a single-pill verdict per pair
- **Single-entry detail page** (`/entry/[file]/[index]`) — deep dive into one specific request: title block with method / status / URL; performance card with stacked timing bar, phase grid, and a context strip ranking this entry's time and content size against the file's P50 / P95 / P99 and size distribution; Request, Response, and Content cards exposing headers (sortable a–z), parsed cookies, parsed query string, raw `Set-Cookie` values, and the response body (capped at 50 000 chars with "Show full" toggle + copy-to-clipboard; binary and no-body fallbacks). Linked from the per-file entry list URL cell, the `/compare` per-entry expand-panel header, and the `/kv-search` expanded panel
- All data processed entirely in the browser — no server required
- Persistent state via `IndexedDB` across page refreshes to bypass typical browser quota limits

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
| `npx vitest run` | Run the test suite once               |

## Usage

1. **Upload HAR files** — drag one or more `.har` files onto the upload zone, or click to open the file picker. Files can be added incrementally.
2. **Review the comparison table** — see total requests, unique URL counts, per-status-code counts, per-content-type counts, total response size, and content size distribution buckets for each file in a single table.
3. **Drill into details** — click any status code, the "Unique URLs" row, any content type label, or any content size range to open a details page filtered to that dimension.
4. **Inspect per-file performance** — click a file name chip or the file detail link to see P50/P95/P99 latency, slowest requests, largest resources, and an average timing breakdown across all requests.
5. **See the cross-file performance overview** — click "Performance Dashboard" on the home page to open `/performance`, which lays every loaded file out side by side: KPI matrix, timing-phase comparison, shared-axis distribution histogram, per-content-type table, and combined Slowest/Largest top lists.
6. **Compare two specific runs head-to-head** — when at least two files are loaded, click "Compare two runs →" (visible on the home page and on the performance dashboard) to open `/performance/diff`. Pick a baseline and compare file, toggle Path / Full URL matching, and review headline KPI Δs, per-phase timing Δs, an overlaid histogram, per-content-type Δs, biggest movers, regressions/improvements, and unique-URL listings.
7. **Compare a URL across files** — from the URL detail view, click any URL to open the compare page. Expand any request row to see its headers, cookies, a **Timing** tab showing phase-by-phase breakdown (DNS, TCP connect, SSL, send time, TTFB, and receive time), and a **Content** tab displaying the exact text payload of the response.
8. **Diff response bodies** — click "Content Diff" on the compare page (or navigate to `/content-diff`) to search for a URL and compare the response body of any two entries side by side. Toggle "Ignore query string" to group requests to the same endpoint regardless of query params. Click any URL in the entry table to jump to the compare page for that request.
9. **Diff headers and cookies** — click "Header Diff" on the compare page (or navigate to `/header-diff`) to compare request/response headers and cookies between any two entries. Color-coded rows show exactly which headers were added, removed, or changed.
10. **Audit CORS** — when at least one cross-origin request is captured, click "CORS Audit" on the home page (or the per-file CORS Audit → link in `/file/[index]`) to open `/cors`. Filter by file scope, severity, or request Origin; click a finding to expand the handshake panel; or open the Preflight pairs section to see each OPTIONS request chained with its actual follow-up request.
11. **Search headers and cookies** — click "Search Headers/Cookies" on the home page (or the per-file link in `/file/[index]`, or any header name in the `/cors` handshake panel) to open `/kv-search`. Enter a name, value, or URL fragment; pick a mode and scope; click any result row to expand the matching pair(s) with the matched substrings highlighted. The expanded URL line deep-links straight to the single-entry detail page for that hit.
12. **Inspect a single request in depth** — click any URL in the per-file entry list, the "Detail →" link in `/compare`'s expand panel, or the expanded URL in a `/kv-search` result to open `/entry/[file]/[index]`. The page contrasts this entry's time and size against the file's P50/P95/P99, shows the full timing phase grid, and lets you browse headers/cookies/query string/response body in one place.
13. **Remove or clear files** — click the × on a file chip to remove it, or use "Clear all" in the header to reset.

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
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Main page: upload + comparison table
│   ├── globals.css         # Global styles
│   ├── details/
│   │   └── page.tsx        # Details page (status / URL / content type)
│   ├── file/
│   │   └── [index]/
│   │       └── page.tsx    # Per-file performance dashboard (accepts ?search= to seed filter)
│   ├── performance/
│   │   ├── page.tsx        # Cross-file performance overview
│   │   └── diff/
│   │       └── page.tsx    # Pair-mode baseline vs. compare diff dashboard
│   ├── compare/
│   │   └── page.tsx        # Per-URL cross-file comparison with expandable request detail
│   ├── content-diff/
│   │   └── page.tsx        # Response body diff page with unified/side-by-side modes
│   ├── header-diff/
│   │   └── page.tsx        # Header/cookie diff page
│   ├── kv-search/
│   │   └── page.tsx        # Header & cookie search across all loaded files
│   ├── cors/
│   │   └── page.tsx        # CORS audit dashboard (issues table + handshake + pairs)
│   └── entry/
│       └── [file]/
│           └── [index]/
│               └── page.tsx # Single-entry detail page (perf ranking + request/response/content)
├── components/
│   ├── FileUpload.tsx          # Drag-and-drop file upload zone
│   ├── ComparisonTable.tsx     # Cross-file comparison table
│   ├── StatusBadge.tsx         # Reusable status code color badge
│   ├── UnifiedDiffView.tsx     # Single-panel diff renderer
│   ├── SideBySideDiffView.tsx  # Two-column diff renderer
│   ├── HeaderDiffView.tsx      # Key-value header/cookie diff renderer
│   └── timingPhases.ts         # Shared TIMING_PHASES color/label table reused by every timing bar
├── types/
│   └── har.ts              # HAR format and analysis TypeScript types
├── utils/
│   ├── harParser.ts        # HAR parsing and analysis logic
│   ├── storage.ts          # IndexedDB read/write helpers
│   ├── contentDiff.ts      # Diff engine: computeDiff, prettifyIfJson, stripQuery, buildUrlGroups
│   ├── headerDiff.ts       # Header/cookie diff engine: diffKvPairs, computeHeaderDiff
│   ├── perfStats.ts        # Performance helpers: percentiles, timing avgs, histogram, regressions, content-type Δ
│   ├── perfFormat.ts       # Δ formatters: formatDelta, formatPctChange, deltaTone
│   ├── corsAnalysis.ts     # CORS audit: cross-origin / preflight detection, preflight pairing, 9 finding kinds
│   ├── kvSearch.ts         # Header/cookie search engine: compileMatcher, searchEntries, scope URL helpers
│   └── entryStats.ts       # Single-entry lookup + file-relative ranking (compareEntryToFile, parseUrlQuery, …)
└── sample-hars/            # Sample HAR files for testing
    ├── sample-a.har
    ├── sample-b.har
    └── sample-c.har
```

## Tech Stack

- **Next.js 16** (App Router, client components)
- **TypeScript** (strict mode)
- **Tailwind CSS v4** (dark theme)
- **React 19**
- **`diff`** (line and character-level diffing for the Content Diff page)
- **Vitest** + **@testing-library/react** + **fast-check** (unit and property-based tests)
