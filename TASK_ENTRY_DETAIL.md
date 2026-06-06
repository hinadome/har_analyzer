# Single-entry Detail Page — Task Tracker

A new `/entry/[file]/[index]` route that renders a permalink-friendly,
single-entry view of a specific HAR request: performance breakdown,
request, response, cookies, query, and content body, with comparison
hints relative to the rest of its file.

Boxes are checked as work lands.

## Decisions (locked)

- Route: **top-level `app/entry/[file]/[index]/page.tsx`** (matches the
  `harFileIndex` / `indexInFile` identifiers already used by
  `kvEntryId` on `/kv-search`).
- Layout: **single-column Card layout** (linear scrolling), not tabs.
- No HAR-parser changes — `EntryRecord` already carries every field
  needed (`requestHeaders`, `responseHeaders`, `requestCookies`,
  `responseCookies`, `responseContent`, `timings`, `startedDateTime`,
  …).
- Engine reuse — performance ranking reuses
  `computePerfStats` / `percentile` / `normalizeTiming` from
  `utils/perfStats.ts`; binary-body detection reuses `isBinaryEntry`
  from `utils/contentDiff.ts`.
- Identifier scheme — segments are `[file]` (= `harFileIndex`) and
  `[index]` (= `indexInFile`), both 0-based non-negative integers.
  Out-of-range / non-integer segments render a "not found" fallback,
  not a crash.
- Fallbacks — empty store → "load a HAR file" prompt; missing file
  index → "file not loaded" notice; missing entry index → "entry not
  found" notice. All keep the page header / back-nav rendered.
- Zero new npm packages.

## Tasks

- [x] **Phase 1 — Engine (`utils/entryStats.ts`)**
  - [x] Types: `TimeRank`, `SizeRank`, `EntryComparison`.
  - [x] Store lookups: `getEntryByPosition(store, fileIndex, indexInFile)`
        with bounds + integer validation; `findIndexInFile(store,
fileIndex, entry)` for the reverse lookup used by discovery links.
  - [x] `compareEntryToFile(entry, fileEntries)` — ranks `entry.time`
        against the file's P50 / P95 / P99 (computed via
        `computePerfStats` on the population excluding the entry
        itself) and `entry.contentSize` against the median + P90 of
        the same population. Returns `TimeRank` (`faster-than-p50` /
        `between-p50-p95` / `slower-than-p95` / `slower-than-p99`)
        and `SizeRank` (`below-median` / `above-median` / `top-decile`).
  - [x] `findHeader(headers, name)` — case-insensitive first-match
        header lookup, `null` when absent.
  - [x] `parseUrlQuery(url)` — ordered name/value list via
        `URL.searchParams`; empty array on unparseable URL.
  - [x] `throughputKBps(entry)` — `contentSize / 1024 / (receive_ms /
1000)`, `null` when `receive` is `-1` / `0` or body is empty.
  - [x] `reusedConnection(timings)` — `true` when both `dns` and
        `connect` normalize to 0 (handles the HAR `-1` sentinel).

- [x] **Phase 2 — Tests (`__tests__/entryStats.test.ts`)**
  - [x] 23 specs across 6 describe blocks: `getEntryByPosition` (3),
        `findIndexInFile` (2), `compareEntryToFile` (4), `findHeader`
        (3), `parseUrlQuery` (4), `throughputKBps` (3),
        `reusedConnection` (4). All green; the
        `medianTime`/`p95Time`/`p99Time` ↔ `p50`/`p95`/`p99`
        field-name fix was caught here before any UI was built.

- [x] **Phase 3 — Page scaffold**
  - [x] `app/entry/[file]/[index]/page.tsx` (`'use client'`) with
        `Suspense` wrapper, `useParams` → numeric segments →
        `getEntryByPosition`, and the three fallback states
        (loading / no HAR loaded / file not loaded / entry not
        found, the last with a deep link back to `/file/[index]`).
  - [x] Page header / back-nav consistent with `/cors`,
        `/kv-search`, and `/performance` — extracted as a local
        `Shell` wrapper so every fallback also renders the chrome.
  - [x] Title block: file-name chip → `/file/{fileIndex}`, position
        label (`entry #N`), method, `StatusBadge`, status text, and
        the full URL on its own line.
  - [x] Summary card (single `<section>`): Method · Status (code +
        text) · Content-Type · Size (`formatBytes`) · Total time
        (`formatTime`) · Server IP · Started (UTC).
  - [x] Action pills row — deferred to Phase 6 (the route alone is
        enough for direct navigation; nothing rendered yet).
  - [x] `tsc --noEmit` clean; full vitest run 209/210 (the lone
        miss is the pre-existing `contentDiff` Property 10
        large-string timeout, unrelated).

- [x] **Phase 4 — Performance card + shared `timingPhases` module**
  - [x] `components/timingPhases.ts` — single `TIMING_PHASES`
        array (`key`, `label`, `bar`, `text`, `dot`) plus a
        `TimingPhaseStyle` type, typed against
        `TimingPhaseKey` from `utils/perfStats`. The duplicated
        local copies in `/compare`, `/performance`, and
        `/file/[index]` (both inline arrays in the last one)
        have been replaced by imports — field references at the
        call sites were renamed where the local fields differed
        (compare `color`→`text`; performance `p.color`→`p.bar`;
        file's stacked-bar `color`→`bar`, legend `color`→`text`).
  - [x] Stacked timing bar (dns · connect · ssl · send · wait ·
        receive) with per-phase tooltip + percent label.
        `blocked` deliberately omitted — `TIMING_PHASE_KEYS` /
        `computeTimingAvgs` already exclude it, so the entry
        view matches the rest of the app rather than diverging.
  - [x] Phase grid (one cell per phase: dot · label · ms · % of
        total), rendering `—` when the HAR raw value is `-1` or
        missing.
  - [x] Derived hints — `Reused connection` / `New connection`
        chip via `reusedConnection`; `${KB/s}` chip via
        `throughputKBps` when computable; `Cache-Control: …`
        chip when the response header is present; `From cache`
        amber chip when `X-From-Cache` is present.
  - [x] Context strip — Time row (`TimeRank` chip + entry time + file P50/P95/P99 + sample count) and Size row
        (`SizeRank` chip + entry size + file median + P90),
        wired through `compareEntryToFile`. Hidden when the
        file has only the entry itself (single-entry file).
  - [x] `npx tsc --noEmit` clean; full vitest run 209/210 (the
        lone miss remains the pre-existing `contentDiff`
        Property 10 timeout, unrelated).

- [x] **Phase 5 — Request + Response + Content cards**
  - [x] Request card — three `KvSubsection`s (Headers · Cookies ·
        Query string). Method / URL / status are already shown by
        `TitleBlock`, so the card stays focused on KV payloads.
        HTTP version omitted because `EntryRecord` does not carry
        it.
  - [x] Response card — Headers · Cookies subsections, plus a
        `Set-Cookie (raw)` subsection that lists the original
        response-header values verbatim when the response sets
        cookies (preserves `Path` / `HttpOnly` / `Max-Age` /
        `SameSite` attributes that the parsed list strips).
  - [x] Content card — `<pre>` rendering of `responseContent`
        capped at `TRUNCATION_LIMIT` (50 000 chars). Binary
        fallback via `isBinaryEntry`; no-body fallback when
        `responseContent` is empty. "Show full" toggle when the
        body exceeds the cap, and a `CopyButton` that calls
        `navigator.clipboard.writeText` with the full body
        (silently no-ops on insecure contexts).
  - [x] Local `HeaderTable` (name-column toggle: HAR order ↔
        case-insensitive a–z), `CookieTable` (reused for the
        query-string view), and `KvSubsection` wrapper. Tailwind
        v4 only, no new dependencies.

- [x] **Phase 6 — Discovery links**
  - [x] `app/file/[index]/page.tsx` — main paginated entry-list URL
        cell is now a `<Link>` to `/entry/{harFileIndex}/{indexInFile}`
        (the top-10 slowest/largest summary tables keep their
        `/compare?url=…` cross-file link). `indexInFile` resolved
        via an `entryIndexMap` keyed by entry reference.
  - [x] `app/compare/page.tsx` — per-entry expand-panel header now
        carries a `Detail →` link to `/entry/{harFileIndex}/
{indexInFile}` (with `stopPropagation` so it doesn't toggle the
        expand). `indexInFile` resolved via an `entryIndexMap` inside
        `PerFileRow`.
  - [x] **Phase 6.x — kv-search expanded-panel link swap**
    - **Decision** — the full-URL anchor inside `/kv-search`'s
      `ExpandedPanel` (previously `/header-diff?url=<encoded>`) is
      retargeted to `/entry/{harFileIndex}/{indexInFile}` so the
      "drill deeper" hop lands on the specific matching entry
      rather than every entry sharing the URL. The compact-row URL
      cell's `/compare?url=…` link (Phase 8 of TASK_KV_SEARCH)
      stays unchanged.
    - [x] `app/kv-search/page.tsx` — `indexInFile` is threaded from
          `ResultsTable` (already computed at the `kvEntryId` call
          site) through `ResultRow` → `ExpandedPanel` as a new prop;
          swapped the `href` on the full-URL anchor.
    - [x] `spec.md` §4.13 — Expanded-panel row updated to call out
          `/entry/<harFileIndex>/<indexInFile>` instead of
          `/header-diff?url=…`.
    - [x] `README.md` kv-search Usage step — extended with "The
          expanded URL line deep-links straight to the single-entry
          detail page for that hit."
    - [x] `CHANGELOG.md` `[Unreleased] / Changed` — bullet noting the
          kv-search → entry detail retargeting.

- [x] **Phase 7 — Docs**
  - [x] `README.md` — new "Single-entry detail" bullet under
        "Features", a new step under "Usage" describing the page +
        the `/kv-search` deep-link tweak, and new lines in the
        directory tree for `utils/entryStats.ts`,
        `components/timingPhases.ts`, and
        `app/entry/[file]/[index]/`.
  - [x] `spec.md` — new `§4.16 Single-entry detail page
(/entry/[file]/[index])` with route + segments, engine
        helpers, the six cards, the fallback matrix, and the
        discovery-link list. Extended `§5` data-flow diagram with
        the entry-detail branch. Updated `§4.13` expanded-panel row
        to call out the new `/entry/<file>/<index>` target.
  - [x] `CHANGELOG.md` — new `[Unreleased]` block above `[0.1.3]`
        with Added (engine + page + shared timingPhases module +
        discovery links + tests) and Changed (kv-search expanded
        panel link swap).

- [x] **Phase 8 — Verification**
  - [x] `npx tsc --noEmit` — exit 0, zero output.
  - [x] `npx vitest run` — 209 / 210 specs green across 8 suites
        (entry-stats specs included). The 1 failure is the
        pre-existing `__tests__/contentDiff.test.ts` Property 10
        truncation property whose `fast-check` body generator hits
        the 5 s `it()` timeout; unchanged from before this branch
        and unrelated to entry detail.
  - [x] `npm run build` — green. Route table includes
        `ƒ /entry/[file]/[index]` (dynamic, server-rendered on
        demand) alongside the existing routes; static pages
        generated successfully.

## Out of scope (for this round)

- WebSocket / SSE message rendering (HAR `_webSocketMessages` is not
  yet parsed into `EntryRecord`).
- Request body capture (`request.postData.text`) — not currently
  carried on `EntryRecord`.
- Server-Timing header parsing into a dedicated timing breakdown.
- Cross-file entry diffing (would belong on `/compare`, not here).
- Saved permalinks beyond the route itself.
- CSV / clipboard export of the entry's full payload.
