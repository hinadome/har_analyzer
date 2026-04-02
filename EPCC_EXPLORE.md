# Exploration: HAR Analyzer Codebase

**Date**: 2026-04-02 | **Scope**: Medium | **Status**: ✅ Complete

---

## 1. Foundation (What exists)

**Tech stack**: TypeScript 5 (strict), Next.js 16.2.2 (App Router), React 19.2.4, Tailwind CSS v4, ESLint 9

**Architecture**: Client-only Next.js SPA — all HAR parsing and state management runs in the browser. No API routes, no server-side data fetching. Two routes: `/` (upload + comparison) and `/details` (drill-down). Data persisted via `localStorage`.

**Structure**:
```
app/
  layout.tsx          — Root layout (html/body, metadata, globals.css)
  page.tsx            — Main page: file upload, loaded-file chips, comparison table
  globals.css         — Minimal global styles; Tailwind v4 @import
  details/
    page.tsx          — Details page; Suspense-wrapped to satisfy useSearchParams requirement
components/
  FileUpload.tsx      — Drag-and-drop + file picker, accepts .har / application/json
  ComparisonTable.tsx — Cross-file summary table with clickable links
types/
  har.ts              — Full HAR spec types + internal analysis types (EntryRecord, HarAnalysis, HarStore, DetailType)
utils/
  harParser.ts        — parseHarFile, analyzeHar, buildHarStore, getAllStatusCodes, getAllContentTypes, formatBytes, formatTime
  storage.ts          — saveHarStore, loadHarStore, clearHarStore (localStorage key: har_analyzer_data)
```

**CLAUDE.md / AGENTS.md instructions**:
- CLAUDE.md defers entirely to AGENTS.md
- AGENTS.md: _"This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing any code."_ Key breaking change already applied: `params` is a `Promise` in dynamic routes; `useSearchParams` requires `<Suspense>` wrapper (already implemented in `details/page.tsx:36-40`).
- Project CLAUDE.md (at `/workshop/CLAUDE.md`): TypeScript strict mode, Airbnb/Prettier style, arrow functions, error handling in async functions, typecheck before finishing, unit tests for new components/utilities.

---

## 2. Patterns (How it's built)

**All pages are `'use client'`** — no Server Components used. This is intentional: `FileReader` API, `localStorage`, `useSearchParams`, and `useState` all require client context. No server-side rendering of data.

**Data model flow** (`types/har.ts`):
```
HarFile (raw JSON)
  → HarEntry[] (per-request HAR spec)
    → EntryRecord[] (flattened, per-entry working type)
      → HarAnalysis (per-file aggregate: counts + entries[])
        → HarStore { analyses[], allEntries[] }  ←→  localStorage
```

**Component pattern**: Functional arrow components with typed props interfaces defined inline above the component. No class components.

**State management**:
- `app/page.tsx` owns `analyses: HarAnalysis[]` state; restores from `localStorage` on mount (`useEffect` at line 15-19)
- `app/details/page.tsx` (`DetailsPageContent`) owns local `analyses`, `allEntries`, sort/filter/page state; loads from `localStorage` on mount
- No shared context or global store — cross-page communication is entirely through `localStorage`

**Filtering and sorting** (`details/page.tsx:64-98`):
- `useMemo` chain: `allEntries → filtered (by type+value+search) → sorted (by field+dir) → paginated`
- Sort state resets to page 1 on sort field change (`toggleSort` at line 124-132)
- URL view uses a separate `groupedByUrl` memo (`Map<url, GroupedByUrl>`) derived from the same `filtered` array

**Routing / navigation** (Next.js 16 App Router):
- Details page URL: `/details?type={status|url|contentType}&value={encoded}`
- `useSearchParams()` reads `type` and `value` at `details/page.tsx:44-46`
- Navigation via `<Link href="...">` — no programmatic `useRouter` calls
- `params` as Promise pattern (Next.js 16 breaking change) is N/A here since no dynamic `[slug]` segments are used

**Styling**: Tailwind v4 utility classes only. Dark slate palette (`slate-950` bg, `slate-100` text). Status code color coding consistent between `ComparisonTable` (`statusColor`) and `details/page.tsx` (`statusBadge`). Both functions are private to their file — slight duplication worth noting.

**Error handling**:
- `parseHarFile` rejects with typed `Error` objects for invalid JSON or missing `log.entries`
- `saveHarStore` re-throws with user-friendly message on quota exceeded
- `loadHarStore` swallows errors and returns `null` (safe fallback)
- Main page catches async errors and displays inline error banner (`page.tsx:40-43`)

---

## 3. Constraints (What limits decisions)

**Technical**:
- Next.js 16 (not 14/15): `params` is `Promise<{}>`, `useSearchParams` needs `<Suspense>` — already handled; must maintain this pattern for any new dynamic routes or search-param pages
- TypeScript strict mode: no implicit `any`, no unchecked nulls — all optional chaining with `?? ''` fallbacks already present in `analyzeHar`
- No Jest / no test runner configured — `npm run test` doesn't exist as a script; `npm run typecheck` also absent (only `tsc --noEmit` works directly)
- Tailwind v4: uses `@import "tailwindcss"` not `@tailwind base/components/utilities` — v3 directives will break

**Quality** (from `/workshop/CLAUDE.md`):
- Must write unit tests for new components and utilities
- Must typecheck (`npx tsc --noEmit`) before completing changes
- Run single tests over full suite
- Always update documentation when adding features

**Storage**:
- `localStorage` cap ~5–10 MB; large HAR files (100s of requests with large response bodies) may exceed quota — error is surfaced but no graceful truncation exists

**Performance**:
- HAR parsing is sequential (`for` loop in `handleFilesSelected`, `page.tsx:29-34`) — multiple large files will block the main thread
- `sorted` and `filtered` memos re-run on every search keystroke; no debounce on the filter input (`details/page.tsx:193`)

**Security**: No server, no auth, no external data transmission — attack surface is limited to malformed HAR files (handled by try/catch in `parseHarFile`)

---

## 4. Reusability (What to leverage)

**`statusColor` / `statusBadge` duplication**:
- `statusColor(code)` at `ComparisonTable.tsx:11-17` returns a Tailwind class string
- `statusBadge(code)` at `details/page.tsx:16-23` renders a full `<span>` badge
- These could be extracted to a shared `components/StatusBadge.tsx` if adding more views

**`formatBytes` / `formatTime`** (`utils/harParser.ts:88-99`): Pure utility functions, importable anywhere. Already used in both `ComparisonTable` (indirectly) and `details/page.tsx`.

**`getAllStatusCodes` / `getAllContentTypes`** (`utils/harParser.ts:68-86`): Aggregate helpers over `HarAnalysis[]`. Used only in `ComparisonTable` currently but reusable for any summary view.

**`UrlGroupTable`** (`details/page.tsx:306-412`): A self-contained component defined at module level but not exported. Could be extracted if needed elsewhere.

---

## 5. Handoff (What's next)

**For PLAN**:
- No test infrastructure exists — adding Jest + React Testing Library requires installing dependencies and configuring
- Sequential file parsing is a known bottleneck; `Promise.all` could parallelize it but requires care with index assignment
- The `statusColor`/`statusBadge` duplication is the most obvious refactor opportunity
- Filter input has no debounce — relevant if targeting large (1000+ entry) HAR files

**For CODE**:
- Typecheck: `cd /workshop/har_analyzer && npx tsc --noEmit`
- Lint: `npm run lint`
- Build verification: `npm run build`
- Dev server: `npm run dev` → http://localhost:3000
- Path alias `@/*` maps to project root (configured in `tsconfig.json:21-23`)
- New components go in `components/`, new types in `types/`, new utilities in `utils/`
- All new page components using `useSearchParams` must be wrapped in `<Suspense>`

**For COMMIT**:
- Must pass `npx tsc --noEmit` (no typecheck script in package.json)
- Must pass `npm run lint`
- Must pass `npm run build` (static export check catches missing Suspense boundaries)
- Unit tests required per CLAUDE.md — no test runner currently configured

**Gaps**:
- No test runner configured (`npm run test` script missing, no Jest/Vitest setup)
- No `typecheck` npm script (only raw `npx tsc --noEmit`)
- `HarStore.analyses[].entries` and `HarStore.allEntries` are redundant (same data stored twice in localStorage) — potential storage efficiency improvement
