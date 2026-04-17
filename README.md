# HAR Analyzer

A browser-based tool for uploading, analyzing, and comparing multiple HAR (HTTP Archive) files side by side. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- Upload multiple `.har` files via drag-and-drop or file browser
- Comparison table showing request counts, status codes, unique URLs, content types, content size totals, and content size distribution per file
- Clickable status codes, URLs, content types, and content size ranges that link to detailed breakdowns
- Details pages with sortable, filterable, paginated entry tables
- URL details grouped by endpoint with per-file hit counts and expandable rows
- Per-file performance dashboard: P50/P95/P99 response times, slowest requests, largest resources, and avg timing breakdown (DNS → Connect → SSL → Send → TTFB → Receive)
- Per-URL comparison page showing each HAR file's entries side-by-side with expandable request detail including **Request headers**, **Response headers**, **Cookies**, **Timing**, and **Content** tabs
- Per-request timing breakdown: stacked bar chart and phase grid (DNS, Connect, SSL, Send, TTFB, Receive) shown when expanding any individual request
- All data processed entirely in the browser — no server required
- Persistent state via `IndexedDB` across page refreshes to bypass typical browser quota limits

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Other scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx vitest run` | Run the test suite once |

## Usage

1. **Upload HAR files** — drag one or more `.har` files onto the upload zone, or click to open the file picker. Files can be added incrementally.
2. **Review the comparison table** — see total requests, unique URL counts, per-status-code counts, per-content-type counts, total response size, and content size distribution buckets for each file in a single table.
3. **Drill into details** — click any status code, the "Unique URLs" row, any content type label, or any content size range to open a details page filtered to that dimension.
4. **Inspect per-file performance** — click a file name chip or the file detail link to see P50/P95/P99 latency, slowest requests, largest resources, and an average timing breakdown across all requests.
5. **Compare a URL across files** — from the URL detail view, click any URL to open the compare page. Expand any request row to see its headers, cookies, a **Timing** tab showing phase-by-phase breakdown (DNS, TCP connect, SSL, send time, TTFB, and receive time), and a **Content** tab displaying the exact text payload of the response.
6. **Remove or clear files** — click the × on a file chip to remove it, or use "Clear all" in the header to reset.

### Understanding timing data

HAR files record per-request timing phases from `entry.timings`. The app displays six of them:

| Phase | What it measures |
|-------|-----------------|
| DNS | DNS lookup time (0 ms on cached/reused connections) |
| Connect | TCP handshake time (0 ms on keep-alive connections) |
| SSL | TLS negotiation time (0 ms on HTTP or reused connections) |
| Send | Time to transmit the request to the server |
| TTFB | Server think time — from request sent to first byte received |
| Receive | Time to download the response body |

Phases the browser marks as "not applicable" (`-1` in the HAR spec) are shown as 0 ms. The `blocked` phase (connection queuing time) is stored but excluded from the visual breakdowns; this means the bar total may be slightly less than the displayed total request time.

The **file performance page** shows *averages* of these phases across all requests in a file. The **compare page Timing tab** shows the breakdown for one individual request.

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
│   │       └── page.tsx    # Per-file performance dashboard
│   └── compare/
│       └── page.tsx        # Per-URL cross-file comparison with expandable request detail
├── components/
│   ├── FileUpload.tsx      # Drag-and-drop file upload zone
│   ├── ComparisonTable.tsx # Cross-file comparison table
│   └── StatusBadge.tsx     # Reusable status code color badge
├── types/
│   └── har.ts              # HAR format and analysis TypeScript types
└── utils/
    ├── harParser.ts        # HAR parsing and analysis logic
    └── storage.ts          # IndexedDB read/write helpers
```

## Tech Stack

- **Next.js 16** (App Router, client components)
- **TypeScript** (strict mode)
- **Tailwind CSS v4** (dark theme)
- **React 19**
- **Vitest** + **@testing-library/react** (unit/property-based tests)
