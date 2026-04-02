# HAR Analyzer

A browser-based tool for uploading, analyzing, and comparing multiple HAR (HTTP Archive) files side by side. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- Upload multiple `.har` files via drag-and-drop or file browser
- Comparison table showing request counts, status codes, unique URLs, and content types per file
- Clickable status codes, URLs, and content types that link to detailed breakdowns
- Details pages with sortable, filterable, paginated entry tables
- URL details grouped by endpoint with per-file hit counts and expandable rows
- Per-file performance dashboard: P50/P95/P99 response times, slowest requests, largest resources, and avg timing breakdown (DNS → Connect → SSL → Send → TTFB → Receive)
- Per-URL comparison page showing each HAR file's entries side-by-side with expandable request detail including **Request headers**, **Response headers**, **Cookies**, and **Timing** tab
- Per-request timing breakdown: stacked bar chart and phase grid (DNS, Connect, SSL, Send, TTFB, Receive) shown when expanding any individual request
- All data processed entirely in the browser — no server required
- Persistent state via `localStorage` across page refreshes

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

## Usage

1. **Upload HAR files** — drag one or more `.har` files onto the upload zone, or click to open the file picker. Files can be added incrementally.
2. **Review the comparison table** — see total requests, unique URL counts, per-status-code counts, and per-content-type counts for each file in a single table.
3. **Drill into details** — click any status code, the "Unique URLs" row, or any content type label to open a details page filtered to that dimension.
4. **Inspect per-file performance** — click a file name chip or the file detail link to see P50/P95/P99 latency, slowest requests, largest resources, and an average timing breakdown across all requests.
5. **Compare a URL across files** — from the URL detail view, click any URL to open the compare page. Expand any request row to see its headers, cookies, and a **Timing** tab showing phase-by-phase breakdown (DNS, TCP connect, SSL, send time, TTFB, and receive time).
6. **Remove or clear files** — click the × on a file chip to remove it, or use "Clear all" in the header to reset.

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
    └── storage.ts          # localStorage read/write helpers
```

## Tech Stack

- **Next.js 16** (App Router, client components)
- **TypeScript** (strict mode)
- **Tailwind CSS v4** (dark theme)
- **React 19**
