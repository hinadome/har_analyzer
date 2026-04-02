# HAR Analyzer

A browser-based tool for uploading, analyzing, and comparing multiple HAR (HTTP Archive) files side by side. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- Upload multiple `.har` files via drag-and-drop or file browser
- Comparison table showing request counts, status codes, unique URLs, and content types per file
- Clickable status codes, URLs, and content types that link to detailed breakdowns
- Details pages with sortable, filterable, paginated entry tables
- URL details grouped by endpoint with per-file hit counts and expandable rows
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
4. **Remove or clear files** — click the × on a file chip to remove it, or use "Clear all" in the header to reset.

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
│   └── details/
│       └── page.tsx        # Details page (status / URL / content type)
├── components/
│   ├── FileUpload.tsx      # Drag-and-drop file upload zone
│   └── ComparisonTable.tsx # Cross-file comparison table
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
