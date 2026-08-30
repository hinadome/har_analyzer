# HAR Analyzer — Refactor Plan

> Status: revised after codebase validation. Execution-ready phase list.
> Goal: keep the analysis engines; thin and unify the UI; fix scale and privacy; make one primary workflow obvious.

---

## Principles

1. **Do not break domain depth** — CORS pairing, KV search, content/header diffs, perf pair-diff stay. Refactor structure, not features.
2. **Utils stay pure** — keep analysis in `utils/*`; pages become thin orchestrators.
3. **Ship in slices** — each phase leaves the app usable; extract → move → delete. No big-bang rewrites.
4. **Measure before optimizing** — confirm large-HAR pain with a real fixture before workers or lazy-body work.
5. **One source of chrome** — headers, empty/loading states are not copy-pasted per page.
6. **Preserve deep-link contracts** — do not drop or rename query params (`?url=`, `?file=`, `?type=`, `?value=`, `?expand=`, `?severity=`, `?origin=`, kv-search needles/scope/mode). Changing chrome must not break those URLs.
7. **Don’t regress existing a11y** — kv-search chips, file pickers, and CORS filters already have `aria-*`. New shell/nav must keep keyboard access.

---

## Current pain (validated)

| Area | Evidence | Cost |
| --- | --- | --- |
| God pages | 800–1668 LOC routes (`performance/diff` 1668, `cors` 1124, `compare` 1080, `kv-search` 953, …) | Hard reviews, duplicated bugs |
| Chrome duplication | 11 client pages each own sticky header + brand + `ThemeToggle`; 4 local `PageHeader`s; back labels drift (`Back`, `Home`, `← Back to upload`, `All URLs`) | UX drift |
| Color palette drift | `FILE_COLORS` copied in `/performance`, `/performance/diff`, `/cors`, `/kv-search` | Visual inconsistency |
| Weak home insight | Comparison matrix is inventory; tools are equally weighted pills | Users don’t know where to start |
| Eager store | `analyzeHar` copies `responseContent` onto every `EntryRecord`; `storage.ts` writes the whole `HarStore` to one IDB key (`har_analyzer_data`); no `version` field | Tab freezes / quota on real HARs |
| Secrets persistence | Auth headers, cookies, bodies in IDB with no banner, redaction, or TTL | Shared-machine risk |
| Next.js as SPA shell | Nearly every page is `"use client"`; `layout.tsx` is a Server Component (`metadata`) | Framework weight without SSR benefit |
| Tests skewed to utils | Utils well-covered; `preservation.test.tsx` and `bug-conditions.test.tsx` inline a fake `Cell`; no `test` script; no CI | Regressions in large pages |
| List scale | `/details`, `/file`, `/compare` already paginate at 50; **`/kv-search` does not** | Search results can grow unbounded |

Sample fixtures (`sample-hars/*.har`) are ~8 KB each — they cannot validate scale.

---

## Target architecture (end state)

```
app/
  layout.tsx                 # Server: metadata + ThemeProvider only
  page.tsx                   # Home: upload + insight strip + comparison table
  …existing routes…          # Thinner orchestrators; URLs unchanged

components/
  shell/                     # AppHeader, EmptyState, LoadingState, shallow Breadcrumbs
  shared/                    # fileColors, (later) AppNav if justified
  tables/                    # Shared pagination / entry-list pieces if overlap is real
  timing/                    # timingPhases.ts already exists — keep as the single source
  diff/                      # Unified / side-by-side / header views + shared URL/entry picker
  cors/ | compare/ | …       # Colocated extracts from god pages
  upload/                    # FileUpload + file chip list (when extracted)

hooks/
  useHarStore.ts             # Keep pub/sub; extend with version / body-load helpers

utils/                       # Unchanged layout unless a later tidy is justified
types/
  har.ts                     # Add store version when IDB schema splits
```

**Do not** introduce an `app/(tools)/` route group as part of this work — it is cosmetic and churns imports for no user benefit.

**`layout.tsx` stays a Server Component.** Shell pieces are client children. Do not move `AppHeader` into `layout.tsx` in a way that breaks `metadata` or forces the whole tree client-side without need.

**Mental model for users**

1. **Load** files
2. **See** summary + anomalies / cheap cross-file deltas
3. **Drill** into a tool that matches the job

Navigation is hierarchical (shallow crumbs + a real parent), not “always back to upload.”

### Which tools are global vs contextual

| Kind | Routes | When shown |
| --- | --- | --- |
| Global (files loaded) | Home, Performance, KV search, Content Diff, Header Diff | Always once ≥1 file exists |
| Conditional | Pair diff (`/performance/diff`) | ≥2 files |
| Conditional | CORS (`/cors`) | ≥1 cross-origin request |
| Contextual only | `/compare?url=`, `/details`, `/file/[index]`, `/entry/...` | Linked from a row / chip — **not** dumped into a global nav |

Phase 1 must not promote `/compare` into a top-level nav item. Content/header diff *may* appear as global tools (they have their own URL search) even though today they are only linked from `/compare`.

---

## Phases

### Phase 0 — Baseline, fixtures, and guardrails (½–1 day)

**Outcomes**

- Chrome inventory: table of pages × header / back-target / empty / loading (this is the extract checklist).
- Decide primary home CTA:
  - ≥2 files → **Compare two runs** (`/performance/diff`)
  - 1 file → **Open file performance** (`/file/0`)
- Obtain a **real large HAR** (multi-MB, thousands of entries with bodies). Note size, entry count, and whether it is committed or kept local. Current samples are not sufficient.
- Record a baseline: upload that fixture → time until the home table is interactive.
- Add `"test": "vitest run"` to `package.json`. Do not wait for a later quality phase.

**Done when**

- [x] Chrome inventory exists (in this file or a short appendix).
- [x] Primary CTAs agreed (defaults above unless overturned).
- [ ] Large-HAR fixture identified; baseline timing written down. *(blocked: only ~8 KB samples in-repo; keep a local multi-MB capture and record size/entry count here when available)*
- [x] `npm test` runs the existing Vitest suite.

**Risk:** Low. Wrong CTA or skipping the large fixture locks later phases into guesswork.

---

### Phase 1 — Thin shared shell (2–3 days)

**Problem:** Every page reimplements sticky header, brand, theme toggle, and a weak/inconsistent back link.

**Work**

1. Extract `components/shell/AppHeader.tsx` — brand, theme, optional clear-all, slots for **back target** and **page title/actions**. Do not invent a full `AppNav` yet.
2. Extract `components/shell/EmptyState.tsx` and `LoadingState.tsx`. Replace “← Back to upload” as the only recovery path with a consistent empty state that still links home.
3. Extract `components/shared/fileColors.ts` — one `FILE_COLORS` / `fileColor(i)` used by performance, pair-diff, cors, kv-search.
4. Shallow breadcrumbs only: `Home → {Current tool}`. Do **not** try to reconstruct File A → Entry → query-state crumbs in this phase.
5. Migrate **home + one secondary page** (recommend `/header-diff` — smallest). Remaining pages keep their local headers until Phase 2 extracts make the swap cheap.
6. Keep every existing deep link and query param.

**Done when**

- [x] `AppHeader`, `EmptyState`, `LoadingState`, `fileColors` exist and are used on `/` and one other route.
- [x] No new global nav that includes `/compare`.
- [ ] Light + dark smoke on those two pages (manual is fine).
- [x] `npm test` green.

**Risk:** Low if scope stays thin.  
**Non-goals:** Full nav bar, context-aware crumbs, redesign, analysis changes.

---

### Phase 2 — Split god pages (1–2 weeks, one route family per PR)

**Problem:** Route files own layout + URL state + presentational markup.

**Order**

| Priority | Route | Extract first |
| --- | --- | --- |
| 1 | `app/performance/diff/page.tsx` | KPI Δ cards, phase Δ, histogram, movers tables, file pickers |
| 2 | `app/cors/page.tsx` | KPI cards, issues table, HandshakePanel, Preflight pairs |
| 3 | `app/compare/page.tsx` | PerFileRow, expand tabs (headers / cookies / timing / content) |
| 4 | `app/kv-search/page.tsx` | Query bar, scope chips, results table, expanded panel |
| 5 | `app/content-diff/page.tsx` + `app/header-diff/page.tsx` | **Shared URL-search + entry picker** first, then page-specific panels |
| 6 | `app/performance/page.tsx` | KPI matrix, timing compare, histogram, CT table |
| 7 | `app/file/[index]/page.tsx` | Perf summary + paginated entry list |
| 8 | `app/entry/.../page.tsx` | Request / Response / Content cards |
| 9 | `app/details/page.tsx` | Entry table / URL-group table if still bulky |

**Rules**

- Page keeps: URL search params, `useHarStore`, wiring props.
- Components receive data + callbacks; no direct IDB writes except via existing store helpers.
- Colocate by domain (`components/cors/HandshakePanel.tsx`, etc.).
- Reuse `components/timingPhases.ts`; do not add a fourth timing-color table.
- After each extract PR, swap that page onto `AppHeader` / `EmptyState` / `LoadingState`.
- `/entry` and `/compare` look different (full-page cards vs expand tabs). Extract independently. Share later only if overlap is obvious.

**Done when**

- [ ] Presentational JSX is out of the large routes. Orchestrators may still be a few hundred lines of hooks/URL state — that is acceptable. Do **not** treat “&lt;300–400 LOC” as a hard gate.
- [ ] Content-diff and header-diff share one URL/entry picker.
- [ ] No intentional behavior change; `npm test` green.
- [ ] Each extract PR includes or updates a small RTL smoke (landmark: title or primary control) when practical.

**Risk:** Medium (merge conflicts). Mitigate: one route family per PR.

---

### Phase 3 — Home as insight (3–5 days)

**Problem:** Home comparison table is dense and low-signal.

**Work**

1. Keep the comparison table; demote it (collapsed section or “Full metrics” below the fold).
2. Add an **Insight strip** that uses **data already cheap or already computed on home**:
   - Existing aggregates: `totalRequests`, `totalContentSize`, status/method counts.
   - Existing `analyzeStore` CORS report (already on `/`).
   - If ≥2 files: simple headline deltas from those aggregates (request count, error-status count, total size) linking to `/performance/diff`. Do **not** run `computePerfStats` / histograms / pair-regression over all entries on home.
   - Slowest/largest teasers only if they can be derived from a short precomputed list or a cheap single-pass already needed for something else — otherwise link to `/file/[index]` instead of recomputing on home.
3. One primary CTA (Phase 0 decision); secondary tools are links, not a second row of equal pills.
4. After tools are extracted, a compact `AppNav` (global + conditional only) may land here — still no `/compare` in the nav.

**Done when**

- [x] First viewport after upload answers “what should I look at?”
- [x] Comparison matrix still reachable in ≤1 click; its drill-down links unchanged.
- [x] Home does not grow a full perf-dashboard compute path.

**Risk:** Low–medium (copy/layout). Do not hide behind a feature flag unless insight compute creeps.

---

### Phase 4 — Store, scale, and privacy (split; ~2 weeks total)

**Problem:** Eager bodies + single-key IDB + secrets with no policy.

Do **not** treat this as one “done when.” Ship 4a → 4b → 4c as separate PRs.

#### 4a. Persistence split (highest leverage, no required UX change)

1. Version the store (`HarStore.version`). Old one-blob records: message to re-upload (same pattern as `methodCounts`).
2. **Always** persist entry metadata (url, method, status, timings, sizes, headers, cookies) as the hot blob.
3. Persist `responseContent` under **separate IDB keys** (`fileIndex:entryIndex` or equivalent). Read on demand for `/entry` content, `/compare` Content tab, `/content-diff`.
4. This is the scale win. A user toggle “Include response bodies” is optional and later — defaulting it **on** would preserve today’s freeze if bodies still sit in the hot blob.

**Done when**

- [x] Re-upload of the large fixture does not write one giant JSON blob for bodies + metadata.
- [x] Content-diff / entry / compare Content tab still work when bodies exist.
- [x] Missing-body states already used for binary / no-capture still apply.

#### 4b. Main-thread relief

1. Paginate `/kv-search` (same 50-row pattern as details/file/compare) **before** adding a virtualizer.
2. Virtualize only if a single page of results still janks on the large fixture.
3. Move `JSON.parse` + `analyzeHar` to a Web Worker above a size threshold (e.g. 5–10 MB), **feature-flagged**, with the current main-thread path as fallback.
4. Next `standalone` + Docker must copy worker chunks. Add a production smoke: upload a medium file after `npm run build` / image run.
5. Progress UI during parse (file name + entry count) once parse is async enough to show it.

**Done when**

- [x] kv-search is bounded per page.
- [x] Worker path is optional; sync path remains.
- [ ] Upload → interactive time on the Phase 0 fixture is recorded again and is down vs baseline (target set from that baseline, not invented here). *(blocked: same as Phase 0 — no multi-MB fixture in-repo)*

#### 4c. Privacy

1. Banner on first upload: HARs may contain credentials; data stays in this browser’s IndexedDB.
2. Redaction: start as **explicit opt-in** (mask `Authorization`, `Cookie`, `Set-Cookie`, common token query params). Always-on is a product decision — do not silently drop headers that CORS/kv-search need.
3. Keep Clear all. Session-only (memory, no IDB) is optional follow-up.

**Done when**

- [x] Banner shipped.
- [x] Opt-in redaction exists or is explicitly deferred in the PR.

**Risk:** High for 4a/4b (schema + worker bundling). Low for 4c.  
**Non-goals:** Server upload, accounts, encryption-at-rest, request-body capture (never stored today).

---

### Phase 5 — Tests as you go (ongoing; small spike if needed)

**Problem:** Utils are trusted; UI is not. Fake components in tests.

**Work** (start in Phase 0; finish leftovers here)

1. `package.json` `"test": "vitest run"` (Phase 0).
2. Point `preservation` / `bug-conditions` at the real `ComparisonTable` cell (or export a real `Cell`) instead of inlined copies.
3. One RTL smoke per critical route family as those pages are extracted: home, compare, cors, kv-search, content-diff, perf-diff.
4. Optional later: GitHub Actions running `npm test` and `npm run lint`. Deploy docs are the wrong home for the test command.
5. Large-list check: manual or a short test after kv-search pagination — not a virtualizer test unless 4b added one.

**Done when**

- [x] No test reimplements production UI “for convenience.”
- [x] Smokes exist for the route families above.
- [ ] CI is either added or explicitly deferred. *(deferred — run `npm test` locally / in deploy pipeline as needed)*

**Risk:** Low.

---

### Phase 6 — Stack fit (optional, after 1–4)

Keep Next.js until deploy constraints change. `DEPLOYMENT.md` + `Dockerfile` require `output: 'standalone'` and `server.js`.

A short ADR is only worth writing if someone proposes Vite or `output: 'export'`. Refactoring shell + store pays off under either stack; migrating mid-refactor doubles risk.

---

## Suggested PR sequence

1. **PR0** — `npm test` script; chrome inventory / fixture notes if they belong in-repo
2. **PR1** — `AppHeader` + `EmptyState` + `LoadingState` + `fileColors`; migrate home + header-diff
3. **PR2** — Extract `performance/diff` + swap onto shell
4. **PR3** — Extract `cors` + swap onto shell
5. **PR4** — Extract `compare` + swap onto shell
6. **PR5** — Extract `kv-search` + swap onto shell
7. **PR6** — Shared content-diff / header-diff picker; extract remaining tool pages
8. **PR7** — Home insight strip (cheap aggregates only)
9. **PR8** — Store version + separate IDB keys for bodies
10. **PR9** — Paginate kv-search; optional worker (flagged) + deploy smoke
11. **PR10** — Privacy banner + opt-in redaction
12. **PR11** — Remaining test hardening / optional CI

Each PR: behavior-preserving unless the description lists intentional UX changes. Preserve query-param contracts.

---

## Explicit non-goals (near term)

- New analysis features (waterfall canvas, HAR merge, HAR editing).
- Backend / multi-user sync.
- Full visual redesign or design-system adoption.
- Rewriting working `utils/*` algorithms without a consumer need.
- Migrating off Next.js.
- `app/(tools)/` route-group reshuffle.
- Virtualizing tables that already paginate at 50.
- Sharing `/entry` and `/compare` panels before both are extracted and overlap is proven.
- Global nav item for `/compare`.

---

## Success metrics

| Metric | Direction |
| --- | --- |
| Presentational JSX in god `page.tsx` files | Extracted; orchestrators may stay hook-heavy |
| Header / empty / loading implementations | → shared shell |
| `FILE_COLORS` copies | → 1 |
| Home first viewport | Answers “what next?” without README |
| Upload → interactive (Phase 0 large fixture) | Down vs written baseline |
| IDB write shape | Metadata hot; bodies on separate keys |
| Secrets awareness | Banner shipped; redaction opt-in or explicitly deferred |
| `/kv-search` result list | Paginated |
| Tests | `npm test` exists; real UI smokes; no inlined fake `Cell` |

---

## Open questions

1. **Redaction default** — opt-in (recommended), opt-out, or always-on for `Authorization` / Cookie? Always-on breaks some CORS/kv-search workflows unless the UI explains missing values.
2. **Session-only mode** — needed for shared machines, or is Clear all + banner enough?
3. **Commit the large HAR?** — usually no (secrets). Keep it local and record size/entry count in Phase 0 notes.
4. **CI** — add a GitHub Action in Phase 5, or wait?

Resolved:

- Response bodies: always split out of the hot blob; do not rely on a default-on “include bodies” toggle for scale.
- Primary CTA: ≥2 files → pair-diff; 1 file → `/file/0` (Phase 0 can override).
- IndexedDB: keep persistence as default; session-only is optional later.
- Framework: stay on Next.js for `standalone` / Docker / `deploy-vm.sh`.

---

## Validation notes (why this revision)

The first draft was directionally right but not executable:

- Phase 1-then-2 would touch every god page twice; shell now lands thin, then each extract PR adopts it.
- AppNav listed `/compare` and treated Diff as if they were already home-level tools; they are not.
- Breadcrumbs overpromised on URL-state pages; shallow crumbs only in Phase 1.
- `/entry` + `/compare` “shared panels” was aspirational; extract separately.
- A hard 300–400 LOC page cap ignored hook/URL-state reality.
- Home insight before store work would recompute perf on `/` and make large HARs worse.
- Virtualization ignored existing 50-row pagination; kv-search is the actual unbounded list.
- Phase 4 mixed schema, workers, and privacy; workers + Next standalone were under-risked.
- Tests had no `npm test` / CI; Phase 5 said to document Vitest in deploy docs (wrong place).
- `(tools)/` and putting `AppShell` in `layout.tsx` were misleading.
- ~8 KB samples cannot validate Phase 4.

---

## Appendix A — Chrome inventory (Phase 0)

| Route | Sticky header | Local `PageHeader` | Typical back | Empty | Loading | Shell migrated |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | shared | — | — (home) | upload prompt | Parsing… | **yes** |
| `/header-diff` | shared | — | Home | EmptyState | LoadingState | **yes** |
| `/performance/diff` | shared | — | Overview | EmptyState | LoadingState | **yes** (panels extracted) |
| `/cors` | shared | — | Home | EmptyState | LoadingState | **yes** (panels extracted) |
| `/kv-search` | shared | — | Home | EmptyState | LoadingState | **yes** (panels extracted) |
| `/performance` | shared | — | Home | EmptyState | LoadingState | **yes** (panels extracted) |
| `/compare` | shared | — | All URLs | EmptyState | LoadingState | **yes** (PerFileRow extracted) |
| `/content-diff` | shared | — | Home | EmptyState | LoadingState | **yes** (row/hash panels extracted) |
| `/details` | shared | — | Home | EmptyState | LoadingState | **yes** |
| `/file/[index]` | shared | — | Home | EmptyState | LoadingState | **yes** |
| `/entry/[file]/[index]` | shared | — | Home | EmptyState | LoadingState | **yes** |

**Primary CTAs (agreed):** ≥2 files → solid **Compare two runs**; 1 file → solid **Open file performance**.

**Large HAR:** not in-repo. `sample-hars/*` ≈ 8 KB each. Baseline timing TBD when a local multi-MB fixture is available.

**`fileColors`:** single module at `components/shared/fileColors.ts`; `/performance`, `/cors`, `/kv-search` import it. Pair-diff keeps its own baseline/compare (blue/orange) pair colors.

---

## Appendix B — Execution log

| Date | Slice | Notes |
| --- | --- | --- |
| 2026-08-30 | PR0 / Phase 0 | Added `npm test`; chrome inventory; CTAs on home |
| 2026-08-30 | PR1 / Phase 1 | `AppHeader`, `PageShell`, `EmptyState`, `LoadingState`, `fileColors`; migrated `/` + `/header-diff` |
| 2026-08-30 | PR2–PR5 / Phase 2 (partial) | Extracted `/performance/diff`, `/cors`, `/kv-search` onto `PageShell` |
| 2026-08-30 | Phase 2 (complete shell) | Extracted `/performance`, `/compare` (PerFileRow), `/content-diff` panels; shell-migrated `/file`, `/entry`, `/details`. **All 11 routes on shared shell.** Further JSX thinning of compare/content-diff/file/entry/details still optional |
| 2026-08-30 | Phase 3 | Home insight strip (`utils/homeInsights` + `InsightStrip`); primary CTA; tools row; comparison table collapsed behind “Full metrics table” |
| 2026-08-30 | Phase 4a | Store v2: bodies under `har_analyzer_body:{bodyId}`; hot blob strips `responseContent`; legacy migrate on load; `useEntryBody` for entry/compare/content-diff |
| 2026-08-30 | Phase 4b | kv-search paginated (50/page); feature-flagged parse worker (`har_parse_worker` / `NEXT_PUBLIC_HAR_PARSE_WORKER`, ≥5 MB); upload progress UI; sync fallback kept |
| 2026-08-30 | Phase 4c | Privacy banner (dismissible); opt-in redaction via `utils/privacy` + home toggle before save |
| 2026-08-30 | Phase 5 | `ComparisonTableCell` + `filterEntriesBySearch` used by preservation/bug tests; RTL smokes for home/kv/cors/perf-diff/content-diff/shell; CI deferred |

---

## References

- Engines to preserve: `utils/harParser.ts`, `perfStats.ts`, `perfFormat.ts`, `corsAnalysis.ts`, `kvSearch.ts`, `contentDiff.ts`, `headerDiff.ts`, `entryStats.ts`.
- Shared timing already exists: `components/timingPhases.ts`.
- Deploy constraints: `DEPLOYMENT.md`, `Dockerfile`, `next.config.ts` (`output: 'standalone'`).
- Existing docs: `README.md`, `spec.md`, `CHANGELOG.md`.
