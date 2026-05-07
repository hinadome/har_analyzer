"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useHarStore } from "@/hooks/useHarStore";
import { formatBytes, formatTime } from "@/utils/harParser";
import {
  computePerfStats,
  computeTimingAvgs,
  computeHistogram,
  computeRegressions,
  computeContentTypeDelta,
  TIMING_PHASE_KEYS,
  type ContentTypeDeltaRow,
  type HistogramScale,
  type HistogramResult,
  type PerfStats,
  type RegressionRow,
  type TimingAvgs,
  type TimingPhaseKey,
  type UniqueUrlRow,
  type UrlMatchKey,
} from "@/utils/perfStats";
import {
  deltaTone,
  formatDelta,
  formatPctChange,
  type Direction,
} from "@/utils/perfFormat";
import type { HarAnalysis } from "@/types/har";

// ---------------------------------------------------------------------------
// URL-driven state
// ---------------------------------------------------------------------------

interface DiffQuery {
  base: number;
  cmp: number;
  match: UrlMatchKey;
  scale: HistogramScale;
}

function parseQuery(sp: URLSearchParams, fileCount: number): DiffQuery {
  const baseRaw = parseInt(sp.get("base") ?? "0", 10);
  const cmpRaw = parseInt(sp.get("cmp") ?? "1", 10);
  const base =
    Number.isFinite(baseRaw) && baseRaw >= 0 && baseRaw < fileCount
      ? baseRaw
      : 0;
  const cmpFallback = fileCount > 1 ? Math.min(1, fileCount - 1) : 0;
  const cmp =
    Number.isFinite(cmpRaw) && cmpRaw >= 0 && cmpRaw < fileCount
      ? cmpRaw
      : cmpFallback;
  const match: UrlMatchKey = sp.get("match") === "full" ? "full" : "path";
  const scale: HistogramScale = sp.get("scale") === "linear" ? "linear" : "log";
  return { base, cmp, match, scale };
}

// ---------------------------------------------------------------------------
// Page entry
// ---------------------------------------------------------------------------

export default function PerformanceDiffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
          Loading...
        </div>
      }
    >
      <PerformanceDiffPageContent />
    </Suspense>
  );
}

function PerformanceDiffPageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()), analyses.length);

  const setQuery = (patch: Partial<DiffQuery>) => {
    const next = new URLSearchParams(sp.toString());
    const merged = { ...q, ...patch };
    next.set("base", String(merged.base));
    next.set("cmp", String(merged.cmp));
    next.set("match", merged.match);
    next.set("scale", merged.scale);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
        Loading...
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <FallbackShell>
        <p className="text-slate-600 dark:text-slate-400 text-lg">
          No HAR files loaded.
        </p>
        <Link
          href="/"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Back to upload
        </Link>
      </FallbackShell>
    );
  }

  if (analyses.length < 2) {
    return (
      <FallbackShell>
        <p className="text-slate-600 dark:text-slate-400 text-lg">
          Pair-mode comparison needs at least 2 HAR files.
        </p>
        <p className="text-slate-500 dark:text-slate-500 text-sm">
          You have {analyses.length} loaded.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Add another file
          </Link>
          <span className="text-slate-400 dark:text-slate-600">·</span>
          <Link
            href="/performance"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Performance overview →
          </Link>
        </div>
      </FallbackShell>
    );
  }

  const sameFile = q.base === q.cmp;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <PageHeader />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        <PageTitle
          base={analyses[q.base]}
          cmp={analyses[q.cmp]}
          match={q.match}
        />
        <PickerBar query={q} setQuery={setQuery} analyses={analyses} />
        {sameFile ? (
          <SameFileHint />
        ) : (
          <>
            <KpiDeltaTable base={analyses[q.base]} cmp={analyses[q.cmp]} />
            <TimingPhaseDelta base={analyses[q.base]} cmp={analyses[q.cmp]} />
            <HistogramDelta
              base={analyses[q.base]}
              cmp={analyses[q.cmp]}
              query={q}
              setQuery={setQuery}
            />
            <ContentTypeDeltaSection
              base={analyses[q.base]}
              cmp={analyses[q.cmp]}
            />
            <BiggestMoversSection
              base={analyses[q.base]}
              cmp={analyses[q.cmp]}
              match={q.match}
            />
            <RegressionsSection
              base={analyses[q.base]}
              cmp={analyses[q.cmp]}
              match={q.match}
            />
            <OnlyInSection
              base={analyses[q.base]}
              cmp={analyses[q.cmp]}
              baseIndex={q.base}
              cmpIndex={q.cmp}
              match={q.match}
            />
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

function FallbackShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PageHeader />
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">{children}</div>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10 transition-colors">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
        <Link
          href="/performance"
          className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center gap-1.5 text-sm"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Overview
        </Link>
        <div className="h-5 w-px bg-slate-300 dark:bg-slate-700" />
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-blue-600 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01"
            />
          </svg>
          <h1 className="text-xl font-bold tracking-tight">
            Performance · Pair Diff
          </h1>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function PageTitle({
  base,
  cmp,
  match,
}: {
  base: HarAnalysis;
  cmp: HarAnalysis;
  match: UrlMatchKey;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Side-by-side comparison
      </h2>
      <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
        Baseline{" "}
        <span className="font-mono text-slate-700 dark:text-slate-300">
          {base.fileName}
        </span>{" "}
        vs. compare{" "}
        <span className="font-mono text-slate-700 dark:text-slate-300">
          {cmp.fileName}
        </span>
        . Matching by{" "}
        <span className="text-slate-700 dark:text-slate-300">
          {match === "path" ? "URL path (query stripped)" : "full URL"}
        </span>
        .
      </p>
    </div>
  );
}

function SameFileHint() {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center">
      <p className="text-amber-800 dark:text-amber-300 font-medium">
        Pick two different files to see deltas.
      </p>
      <p className="text-amber-700 dark:text-amber-400 text-sm mt-1">
        Baseline and compare currently point to the same HAR.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File picker bar
// ---------------------------------------------------------------------------

function PickerBar({
  query,
  setQuery,
  analyses,
}: {
  query: DiffQuery;
  setQuery: (p: Partial<DiffQuery>) => void;
  analyses: HarAnalysis[];
}) {
  const btnBase = "px-3 py-1.5 text-sm font-medium rounded transition-colors";
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Baseline
        </span>
        <select
          aria-label="Baseline file"
          value={query.base}
          onChange={(e) => setQuery({ base: parseInt(e.target.value, 10) })}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
        >
          {analyses.map((a, i) => (
            <option key={i} value={i}>
              {a.fileName}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => setQuery({ base: query.cmp, cmp: query.base })}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-lg p-1.5 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        title="Swap baseline and compare"
        aria-label="Swap baseline and compare"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
      </button>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Compare
        </span>
        <select
          aria-label="Compare file"
          value={query.cmp}
          onChange={(e) => setQuery({ cmp: parseInt(e.target.value, 10) })}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
        >
          {analyses.map((a, i) => (
            <option key={i} value={i}>
              {a.fileName}
            </option>
          ))}
        </select>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Match
        </span>
        <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
          <button
            type="button"
            className={
              query.match === "path"
                ? `${btnBase} bg-blue-600 text-white`
                : `${btnBase} text-slate-600 dark:text-slate-400`
            }
            onClick={() => setQuery({ match: "path" })}
            title="Match by URL path (query string stripped)"
          >
            Path
          </button>
          <button
            type="button"
            className={
              query.match === "full"
                ? `${btnBase} bg-blue-600 text-white`
                : `${btnBase} text-slate-600 dark:text-slate-400`
            }
            onClick={() => setQuery({ match: "full" })}
            title="Match by full URL (query string included)"
          >
            Full URL
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: KPI delta table (Phase 3a)
// ---------------------------------------------------------------------------

interface KpiRow {
  label: string;
  /** which side counts as "better" for color tinting */
  direction: Direction;
  /** raw numeric value used for Δ + % change */
  value: (s: PerfStats) => number;
  /** how to render the cell */
  format: (n: number) => string;
}

const KPI_ROWS: KpiRow[] = [
  {
    label: "Total Requests",
    direction: "neutral",
    value: (s) => s.count,
    format: (n) => Math.round(n).toLocaleString(),
  },
  {
    label: "Total Bytes",
    direction: "neutral",
    value: (s) => s.totalBytes,
    format: (n) => formatBytes(n),
  },
  {
    label: "Wall-clock",
    direction: "lower",
    value: (s) => s.wallClockMs,
    format: (n) => formatWallClockMs(n),
  },
  {
    label: "Avg Time",
    direction: "lower",
    value: (s) => s.avgTime,
    format: formatTime,
  },
  { label: "P50", direction: "lower", value: (s) => s.p50, format: formatTime },
  { label: "P75", direction: "lower", value: (s) => s.p75, format: formatTime },
  { label: "P95", direction: "lower", value: (s) => s.p95, format: formatTime },
  { label: "P99", direction: "lower", value: (s) => s.p99, format: formatTime },
  {
    label: "Slowest",
    direction: "lower",
    value: (s) => s.maxTime,
    format: formatTime,
  },
  {
    label: "Error Rate",
    direction: "lower",
    value: (s) => s.errorRate,
    format: (n) => `${n.toFixed(1)}%`,
  },
];

function formatWallClockMs(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function KpiDeltaTable({ base, cmp }: { base: HarAnalysis; cmp: HarAnalysis }) {
  const baseStats = useMemo(() => computePerfStats(base.entries), [base]);
  const cmpStats = useMemo(() => computePerfStats(cmp.entries), [cmp]);

  const thClass =
    "py-3 px-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60";
  const tdNumClass =
    "py-2.5 px-4 text-sm text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700/50 text-right font-mono";
  const labelTdClass =
    "py-2.5 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700/50";

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Headline metrics
        <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
          baseline vs. compare, with Δ and % change
        </span>
      </h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${thClass} text-left w-48`}>Metric</th>
              <th className={`${thClass} text-right min-w-[140px]`}>
                <span
                  className="font-mono normal-case truncate inline-block max-w-[180px] align-bottom"
                  title={base.fileName}
                >
                  {base.fileName}
                </span>
              </th>
              <th className={`${thClass} text-right min-w-[140px]`}>
                <span
                  className="font-mono normal-case truncate inline-block max-w-[180px] align-bottom"
                  title={cmp.fileName}
                >
                  {cmp.fileName}
                </span>
              </th>
              <th className={`${thClass} text-right min-w-[120px]`}>Δ</th>
              <th className={`${thClass} text-right min-w-[90px]`}>% change</th>
            </tr>
          </thead>
          <tbody>
            {KPI_ROWS.map((row) => {
              const b = row.value(baseStats);
              const c = row.value(cmpStats);
              const delta = c - b;
              const tone = deltaTone(delta, row.direction);
              return (
                <tr
                  key={row.label}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className={labelTdClass}>{row.label}</td>
                  <td className={tdNumClass}>{row.format(b)}</td>
                  <td className={tdNumClass}>{row.format(c)}</td>
                  <td className={`${tdNumClass} ${tone}`}>
                    {formatDelta(delta, row.format)}
                  </td>
                  <td className={`${tdNumClass} ${tone} font-semibold`}>
                    {formatPctChange(b, c)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: avg timing-phase comparison (Phase 3b)
// ---------------------------------------------------------------------------

const TIMING_PHASES: ReadonlyArray<{
  key: TimingPhaseKey;
  label: string;
  color: string;
  text: string;
}> = [
  {
    key: "dns",
    label: "DNS",
    color: "bg-blue-600 dark:bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  {
    key: "connect",
    label: "Connect",
    color: "bg-green-600 dark:bg-green-500",
    text: "text-green-600 dark:text-green-400",
  },
  {
    key: "ssl",
    label: "SSL",
    color: "bg-purple-600 dark:bg-purple-500",
    text: "text-purple-600 dark:text-purple-400",
  },
  {
    key: "send",
    label: "Send",
    color: "bg-slate-400",
    text: "text-slate-700 dark:text-slate-300",
  },
  {
    key: "wait",
    label: "TTFB",
    color: "bg-amber-600 dark:bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    key: "receive",
    label: "Receive",
    color: "bg-cyan-600 dark:bg-cyan-500",
    text: "text-cyan-600 dark:text-cyan-400",
  },
];

function TimingPhaseDelta({
  base,
  cmp,
}: {
  base: HarAnalysis;
  cmp: HarAnalysis;
}) {
  const baseT = useMemo(() => computeTimingAvgs(base.entries), [base]);
  const cmpT = useMemo(() => computeTimingAvgs(cmp.entries), [cmp]);
  const maxTotal = Math.max(baseT.total, cmpT.total) || 1;

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Avg Timing-Phase Breakdown
        <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
          per request — bars share the same axis
        </span>
      </h3>
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <PairTimingRow
          label="Baseline"
          fileName={base.fileName}
          timing={baseT}
          maxTotal={maxTotal}
        />
        <PairTimingRow
          label="Compare"
          fileName={cmp.fileName}
          timing={cmpT}
          maxTotal={maxTotal}
        />
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-2 border-t border-slate-200 dark:border-slate-700/50">
          {TIMING_PHASES.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5 text-xs">
              <span className={`w-2.5 h-2.5 rounded-sm ${p.color}`} />
              <span className={p.text}>{p.label}</span>
            </span>
          ))}
        </div>
      </div>
      <PhaseDeltaTable base={baseT} cmp={cmpT} />
    </section>
  );
}

function PairTimingRow({
  label,
  fileName,
  timing,
  maxTotal,
}: {
  label: string;
  fileName: string;
  timing: TimingAvgs;
  maxTotal: number;
}) {
  const widthPct = (timing.total / maxTotal) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 shrink-0">
            {label}
          </span>
          <span
            className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate"
            title={fileName}
          >
            {fileName}
          </span>
        </span>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-400 shrink-0">
          total {formatTime(timing.total)}
        </span>
      </div>
      <div
        className="flex h-5 rounded-md overflow-hidden bg-slate-200 dark:bg-slate-900/60"
        style={{ width: `${Math.max(2, widthPct)}%` }}
      >
        {TIMING_PHASES.map((p) => {
          const val = timing.avgs[p.key];
          const pct = timing.total > 0 ? (val / timing.total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={p.key}
              className={p.color}
              style={{ width: `${pct}%` }}
              title={`${p.label}: ${formatTime(val)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
    </div>
  );
}

function PhaseDeltaTable({ base, cmp }: { base: TimingAvgs; cmp: TimingAvgs }) {
  const thClass =
    "py-2.5 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60";
  const tdNumClass =
    "py-2 px-3 text-sm text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700/50 text-right font-mono";
  const labelTdClass =
    "py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700/50";

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${thClass} text-left w-32`}>Phase</th>
            <th className={`${thClass} text-right`}>Baseline</th>
            <th className={`${thClass} text-right`}>Compare</th>
            <th className={`${thClass} text-right`}>Δ</th>
            <th className={`${thClass} text-right w-24`}>% change</th>
          </tr>
        </thead>
        <tbody>
          {TIMING_PHASE_KEYS.map((k) => {
            const phase = TIMING_PHASES.find((p) => p.key === k)!;
            const b = base.avgs[k];
            const c = cmp.avgs[k];
            const delta = c - b;
            const tone = deltaTone(delta, "lower");
            return (
              <tr
                key={k}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <td className={labelTdClass}>
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-sm ${phase.color}`} />
                    <span className={phase.text}>{phase.label}</span>
                  </span>
                </td>
                <td className={tdNumClass}>{formatTime(b)}</td>
                <td className={tdNumClass}>{formatTime(c)}</td>
                <td className={`${tdNumClass} ${tone}`}>
                  {formatDelta(delta, formatTime)}
                </td>
                <td className={`${tdNumClass} ${tone} font-semibold`}>
                  {formatPctChange(b, c)}
                </td>
              </tr>
            );
          })}
          {(() => {
            const delta = cmp.total - base.total;
            const tone = deltaTone(delta, "lower");
            return (
              <tr className="bg-slate-50 dark:bg-slate-800/40 font-semibold">
                <td className={labelTdClass}>Total</td>
                <td className={tdNumClass}>{formatTime(base.total)}</td>
                <td className={tdNumClass}>{formatTime(cmp.total)}</td>
                <td className={`${tdNumClass} ${tone}`}>
                  {formatDelta(delta, formatTime)}
                </td>
                <td className={`${tdNumClass} ${tone}`}>
                  {formatPctChange(base.total, cmp.total)}
                </td>
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: response-time distribution — 2-color overlaid (Phase 3c)
// ---------------------------------------------------------------------------

/** Two fixed tones reserved for pair-mode: base vs. compare. */
const PAIR_COLORS = {
  base: {
    bar: "bg-blue-500",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  cmp: {
    bar: "bg-orange-500",
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
  },
} as const;

function HistogramDelta({
  base,
  cmp,
  query,
  setQuery,
}: {
  base: HarAnalysis;
  cmp: HarAnalysis;
  query: DiffQuery;
  setQuery: (p: Partial<DiffQuery>) => void;
}) {
  const histogram = useMemo<HistogramResult>(
    () =>
      computeHistogram([base.entries, cmp.entries], {
        scale: query.scale,
        bins: 10,
      }),
    [base, cmp, query.scale],
  );
  const baseCounts = histogram.counts[0] ?? [];
  const cmpCounts = histogram.counts[1] ?? [];
  const bins = baseCounts.length;
  const maxCount = Math.max(...baseCounts, ...cmpCounts, 0);
  const baseTotal = baseCounts.reduce((s, n) => s + n, 0);
  const cmpTotal = cmpCounts.reduce((s, n) => s + n, 0);

  const tabBase = "px-3 py-1 text-xs font-medium rounded transition-colors";
  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          Response-Time Distribution
          <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
            shared {query.scale} axis · 10 buckets
          </span>
        </h3>
        <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
          <button
            type="button"
            className={
              query.scale === "log"
                ? `${tabBase} bg-blue-600 text-white`
                : `${tabBase} text-slate-600 dark:text-slate-400`
            }
            onClick={() => setQuery({ scale: "log" })}
          >
            Log
          </button>
          <button
            type="button"
            className={
              query.scale === "linear"
                ? `${tabBase} bg-blue-600 text-white`
                : `${tabBase} text-slate-600 dark:text-slate-400`
            }
            onClick={() => setQuery({ scale: "linear" })}
          >
            Linear
          </button>
        </div>
      </div>
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        {bins === 0 || maxCount === 0 ? (
          <p className="text-slate-600 dark:text-slate-500 text-sm text-center py-8">
            No timing data available.
          </p>
        ) : (
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${bins}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: bins }).map((_, binIdx) => {
              const lo = histogram.edges[binIdx];
              const hi = histogram.edges[binIdx + 1];
              const bCount = baseCounts[binIdx] ?? 0;
              const cCount = cmpCounts[binIdx] ?? 0;
              const bH = (bCount / maxCount) * 100;
              const cH = (cCount / maxCount) * 100;
              return (
                <div key={binIdx} className="flex flex-col">
                  <div className="flex items-end gap-0.5 h-32">
                    <div
                      className={`flex-1 ${PAIR_COLORS.base.bar} rounded-t-sm transition-all hover:opacity-80`}
                      style={{
                        height: `${Math.max(bCount > 0 ? 2 : 0, bH)}%`,
                      }}
                      title={`Baseline (${base.fileName}): ${bCount.toLocaleString()} requests in ${formatTime(lo)}–${formatTime(hi)}`}
                    />
                    <div
                      className={`flex-1 ${PAIR_COLORS.cmp.bar} rounded-t-sm transition-all hover:opacity-80`}
                      style={{
                        height: `${Math.max(cCount > 0 ? 2 : 0, cH)}%`,
                      }}
                      title={`Compare (${cmp.fileName}): ${cCount.toLocaleString()} requests in ${formatTime(lo)}–${formatTime(hi)}`}
                    />
                  </div>
                  <div
                    className="text-[10px] text-slate-500 dark:text-slate-500 font-mono text-center mt-1 truncate"
                    title={`${formatTime(lo)} – ${formatTime(hi)}`}
                  >
                    {formatTime(lo)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/50 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-sm ${PAIR_COLORS.base.dot}`}
            />
            <span className={PAIR_COLORS.base.text}>Baseline</span>
            <span className="font-mono text-slate-500 dark:text-slate-500 truncate max-w-[200px]">
              {base.fileName}
            </span>
            <span className="text-slate-500 dark:text-slate-500">
              · {baseTotal.toLocaleString()} req
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${PAIR_COLORS.cmp.dot}`} />
            <span className={PAIR_COLORS.cmp.text}>Compare</span>
            <span className="font-mono text-slate-500 dark:text-slate-500 truncate max-w-[200px]">
              {cmp.fileName}
            </span>
            <span className="text-slate-500 dark:text-slate-500">
              · {cmpTotal.toLocaleString()} req
            </span>
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-600 mt-3">
          Buckets are derived once from the union of both files, so bars are
          directly comparable. Bar height is normalised to the larger per-bucket
          count.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: regressions & improvements (Phase 3d)
// ---------------------------------------------------------------------------

function RegressionsSection({
  base,
  cmp,
  match,
}: {
  base: HarAnalysis;
  cmp: HarAnalysis;
  match: UrlMatchKey;
}) {
  const result = useMemo(
    () => computeRegressions(base.entries, cmp.entries, { matchKey: match }),
    [base, cmp, match],
  );
  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Regressions &amp; Improvements
        <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
          per-URL median response time, top 10 each direction · matching by{" "}
          {match === "path" ? "URL path" : "full URL"}
        </span>
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RegressionDeltaTable
          title={`Top 10 regressions (slower in compare) — ${result.regressions.length.toLocaleString()} total`}
          rows={result.regressions.slice(0, 10)}
          tone="bad"
          emptyText="No URLs got slower in compare."
        />
        <RegressionDeltaTable
          title={`Top 10 improvements (faster in compare) — ${result.improvements.length.toLocaleString()} total`}
          rows={result.improvements.slice(0, 10)}
          tone="good"
          emptyText="No URLs got faster in compare."
        />
      </div>
    </section>
  );
}

function RegressionDeltaTable({
  title,
  rows,
  tone,
  emptyText,
}: {
  title: string;
  rows: RegressionRow[];
  tone: "good" | "bad";
  emptyText: string;
}) {
  // Direction is always "lower is better" for response time; tone fixes the
  // semantic accent (red header for regressions, green for improvements).
  const accent =
    tone === "bad"
      ? "text-red-600 dark:text-red-400"
      : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div
        className={`px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wider ${accent}`}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-500 text-center">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900/40">
              <tr>
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  URL
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Base
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Cmp
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Δ
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  % change
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = deltaTone(r.deltaTime, "lower");
                return (
                  <tr
                    key={r.key}
                    className="border-t border-slate-200 dark:border-slate-700/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-1.5 px-3 max-w-0">
                      <Link
                        href={`/compare?url=${encodeURIComponent(r.url)}`}
                        className="block truncate text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs"
                        title={r.url}
                      >
                        {r.url}
                      </Link>
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                      {formatTime(r.baseTime)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                      {formatTime(r.cmpTime)}
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right font-mono text-xs ${t}`}
                    >
                      {formatDelta(r.deltaTime, formatTime)}
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right font-mono text-xs font-semibold ${t}`}
                    >
                      {formatPctChange(r.baseTime, r.cmpTime)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: only in base / only in compare (Phase 3e)
// ---------------------------------------------------------------------------

type UniqueSortField = "count" | "medianTime" | "medianSize" | "url";

function OnlyInSection({
  base,
  cmp,
  baseIndex,
  cmpIndex,
  match,
}: {
  base: HarAnalysis;
  cmp: HarAnalysis;
  baseIndex: number;
  cmpIndex: number;
  match: UrlMatchKey;
}) {
  const result = useMemo(
    () => computeRegressions(base.entries, cmp.entries, { matchKey: match }),
    [base, cmp, match],
  );
  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Unique URLs
        <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
          present in only one run · matching by{" "}
          {match === "path" ? "URL path" : "full URL"} · row links open the
          source file with that URL pre-filtered
        </span>
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UniqueUrlTable
          title={`Only in Base — ${result.onlyInBase.length.toLocaleString()} URL${result.onlyInBase.length === 1 ? "" : "s"}`}
          fileName={base.fileName}
          fileIndex={baseIndex}
          rows={result.onlyInBase}
          accent={PAIR_COLORS.base.text}
          emptyText="Every URL in base also appears in compare."
        />
        <UniqueUrlTable
          title={`Only in Compare — ${result.onlyInCompare.length.toLocaleString()} URL${result.onlyInCompare.length === 1 ? "" : "s"}`}
          fileName={cmp.fileName}
          fileIndex={cmpIndex}
          rows={result.onlyInCompare}
          accent={PAIR_COLORS.cmp.text}
          emptyText="Every URL in compare also appears in base."
        />
      </div>
    </section>
  );
}

function UniqueUrlTable({
  title,
  fileName,
  fileIndex,
  rows,
  accent,
  emptyText,
}: {
  title: string;
  fileName: string;
  fileIndex: number;
  rows: UniqueUrlRow[];
  accent: string;
  emptyText: string;
}) {
  const [sortField, setSortField] = useState<UniqueSortField>("count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const cmpFn = (a: UniqueUrlRow, b: UniqueUrlRow) => {
      let d = 0;
      if (sortField === "count") d = a.count - b.count;
      else if (sortField === "medianTime") d = a.medianTime - b.medianTime;
      else if (sortField === "medianSize") d = a.medianSize - b.medianSize;
      else d = a.url.localeCompare(b.url);
      // Tie-break by median time desc so the most-impactful row floats up.
      if (d === 0 && sortField !== "medianTime")
        d = a.medianTime - b.medianTime;
      return sortDir === "asc" ? d : -d;
    };
    return [...rows].sort(cmpFn);
  }, [rows, sortField, sortDir]);

  const toggle = (f: UniqueSortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      // Numeric columns default to desc (biggest first); URL defaults to asc.
      setSortDir(f === "url" ? "asc" : "desc");
    }
  };

  const headerCls =
    "py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-800 dark:hover:text-slate-200 transition-colors";
  const arrow = (f: UniqueSortField) =>
    sortField === f ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div
        className={`px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wider ${accent}`}
      >
        {title}
        <span className="ml-2 font-mono normal-case font-normal text-[11px] text-slate-500 dark:text-slate-500 truncate inline-block max-w-[260px] align-bottom">
          {fileName}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-500 text-center">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900/40">
              <tr>
                <th
                  className={`${headerCls} text-left`}
                  onClick={() => toggle("url")}
                >
                  URL{arrow("url")}
                </th>
                <th
                  className={`${headerCls} text-right w-16`}
                  onClick={() => toggle("count")}
                >
                  Count{arrow("count")}
                </th>
                <th
                  className={`${headerCls} text-right w-24`}
                  onClick={() => toggle("medianTime")}
                >
                  Med. time{arrow("medianTime")}
                </th>
                <th
                  className={`${headerCls} text-right w-24`}
                  onClick={() => toggle("medianSize")}
                >
                  Med. size{arrow("medianSize")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.key}
                  className="border-t border-slate-200 dark:border-slate-700/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-1.5 px-3 max-w-0">
                    <Link
                      href={`/file/${fileIndex}?search=${encodeURIComponent(r.key)}`}
                      className="block truncate text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs"
                      title={`${r.url}\n\nClick to open ${fileName} filtered to this URL`}
                    >
                      {r.url}
                    </Link>
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                    {r.count.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                    {formatTime(r.medianTime)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                    {formatBytes(r.medianSize)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: per content-type Δ (Phase 3f)
// ---------------------------------------------------------------------------

type ContentTypeSortField =
  | "contentType"
  | "deltaCount"
  | "deltaBytes"
  | "deltaAvg"
  | "deltaP95";

function ContentTypeDeltaSection({
  base,
  cmp,
}: {
  base: HarAnalysis;
  cmp: HarAnalysis;
}) {
  const rows = useMemo(
    () => computeContentTypeDelta(base.entries, cmp.entries),
    [base, cmp],
  );
  const [sortField, setSortField] = useState<ContentTypeSortField>("deltaAvg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const cmpFn = (a: ContentTypeDeltaRow, b: ContentTypeDeltaRow) => {
      let d = 0;
      if (sortField === "contentType")
        d = a.contentType.localeCompare(b.contentType);
      // Δ columns sort by absolute value so the biggest movers (in either
      // direction) surface — sign is encoded in the row's tint, not its rank.
      else if (sortField === "deltaCount")
        d = Math.abs(a.delta.count) - Math.abs(b.delta.count);
      else if (sortField === "deltaBytes")
        d = Math.abs(a.delta.totalBytes) - Math.abs(b.delta.totalBytes);
      else if (sortField === "deltaAvg")
        d = Math.abs(a.delta.avgTime) - Math.abs(b.delta.avgTime);
      else if (sortField === "deltaP95")
        d = Math.abs(a.delta.p95Time) - Math.abs(b.delta.p95Time);
      return sortDir === "asc" ? d : -d;
    };
    return [...rows].sort(cmpFn);
  }, [rows, sortField, sortDir]);

  const toggle = (f: ContentTypeSortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir(f === "contentType" ? "asc" : "desc");
    }
  };
  const arrow = (f: ContentTypeSortField) =>
    sortField === f ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const groupTh =
    "py-1.5 px-3 text-[10px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider text-right border-l border-slate-200 dark:border-slate-700/50";
  const subTh =
    "py-1.5 px-3 text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right";
  const subThSortable = `${subTh} cursor-pointer select-none hover:text-slate-800 dark:hover:text-slate-200 transition-colors`;
  const cell = "py-1.5 px-3 text-right font-mono text-xs";

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Per Content-Type Δ
        <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
          {rows.length.toLocaleString()} content type
          {rows.length === 1 ? "" : "s"} · sorted by |Δ| of the active column ·
          missing on a side counts as 0
        </span>
      </h3>
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-500 text-center">
            No content-type data on either side.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900/40">
                <tr>
                  <th
                    rowSpan={2}
                    className="py-2 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-800 dark:hover:text-slate-200 transition-colors align-bottom"
                    onClick={() => toggle("contentType")}
                  >
                    Content-Type{arrow("contentType")}
                  </th>
                  <th colSpan={3} className={groupTh}>
                    Count
                  </th>
                  <th colSpan={3} className={groupTh}>
                    Bytes
                  </th>
                  <th colSpan={3} className={groupTh}>
                    Avg time
                  </th>
                  <th colSpan={3} className={groupTh}>
                    p95 time
                  </th>
                </tr>
                <tr>
                  <th
                    className={`${subTh} border-l border-slate-200 dark:border-slate-700/50`}
                  >
                    Base
                  </th>
                  <th className={subTh}>Cmp</th>
                  <th
                    className={subThSortable}
                    onClick={() => toggle("deltaCount")}
                  >
                    Δ{arrow("deltaCount")}
                  </th>
                  <th
                    className={`${subTh} border-l border-slate-200 dark:border-slate-700/50`}
                  >
                    Base
                  </th>
                  <th className={subTh}>Cmp</th>
                  <th
                    className={subThSortable}
                    onClick={() => toggle("deltaBytes")}
                  >
                    Δ{arrow("deltaBytes")}
                  </th>
                  <th
                    className={`${subTh} border-l border-slate-200 dark:border-slate-700/50`}
                  >
                    Base
                  </th>
                  <th className={subTh}>Cmp</th>
                  <th
                    className={subThSortable}
                    onClick={() => toggle("deltaAvg")}
                  >
                    Δ{arrow("deltaAvg")}
                  </th>
                  <th
                    className={`${subTh} border-l border-slate-200 dark:border-slate-700/50`}
                  >
                    Base
                  </th>
                  <th className={subTh}>Cmp</th>
                  <th
                    className={subThSortable}
                    onClick={() => toggle("deltaP95")}
                  >
                    Δ{arrow("deltaP95")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  // Count and bytes are neutral (more isn't intrinsically
                  // better); avg + p95 are "lower is better".
                  const tCount = deltaTone(r.delta.count, "neutral");
                  const tBytes = deltaTone(r.delta.totalBytes, "neutral");
                  const tAvg = deltaTone(r.delta.avgTime, "lower");
                  const tP95 = deltaTone(r.delta.p95Time, "lower");
                  const baseCount = r.base?.count ?? 0;
                  const cmpCount = r.cmp?.count ?? 0;
                  const baseBytes = r.base?.totalBytes ?? 0;
                  const cmpBytes = r.cmp?.totalBytes ?? 0;
                  const baseAvg = r.base?.avgTime ?? 0;
                  const cmpAvg = r.cmp?.avgTime ?? 0;
                  const baseP95 = r.base?.p95Time ?? 0;
                  const cmpP95 = r.cmp?.p95Time ?? 0;
                  return (
                    <tr
                      key={r.contentType}
                      className="border-t border-slate-200 dark:border-slate-700/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-1.5 px-3 max-w-0">
                        <Link
                          href={`/details?type=contentType&value=${encodeURIComponent(r.contentType)}`}
                          className="block truncate text-purple-600 dark:text-purple-400 hover:underline font-mono text-xs"
                          title={r.contentType}
                        >
                          {r.contentType}
                        </Link>
                      </td>
                      <td
                        className={`${cell} border-l border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300`}
                      >
                        {baseCount.toLocaleString()}
                      </td>
                      <td
                        className={`${cell} text-slate-700 dark:text-slate-300`}
                      >
                        {cmpCount.toLocaleString()}
                      </td>
                      <td className={`${cell} font-semibold ${tCount}`}>
                        {formatDelta(r.delta.count, (n) => n.toLocaleString())}
                      </td>
                      <td
                        className={`${cell} border-l border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300`}
                      >
                        {formatBytes(baseBytes)}
                      </td>
                      <td
                        className={`${cell} text-slate-700 dark:text-slate-300`}
                      >
                        {formatBytes(cmpBytes)}
                      </td>
                      <td className={`${cell} font-semibold ${tBytes}`}>
                        {formatDelta(r.delta.totalBytes, formatBytes)}
                      </td>
                      <td
                        className={`${cell} border-l border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300`}
                      >
                        {formatTime(baseAvg)}
                      </td>
                      <td
                        className={`${cell} text-slate-700 dark:text-slate-300`}
                      >
                        {formatTime(cmpAvg)}
                      </td>
                      <td className={`${cell} font-semibold ${tAvg}`}>
                        {formatDelta(r.delta.avgTime, formatTime)}
                      </td>
                      <td
                        className={`${cell} border-l border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300`}
                      >
                        {formatTime(baseP95)}
                      </td>
                      <td
                        className={`${cell} text-slate-700 dark:text-slate-300`}
                      >
                        {formatTime(cmpP95)}
                      </td>
                      <td className={`${cell} font-semibold ${tP95}`}>
                        {formatDelta(r.delta.p95Time, formatTime)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: biggest movers — top |Δtime| / |Δsize| (Phase 3g)
// ---------------------------------------------------------------------------

function BiggestMoversSection({
  base,
  cmp,
  match,
}: {
  base: HarAnalysis;
  cmp: HarAnalysis;
  match: UrlMatchKey;
}) {
  // Reuse the same delta result as the Regressions section: every URL present
  // in both runs lives in `regressions ∪ improvements`, so unioning them gives
  // us the full pool to rank by |Δ|.
  const result = useMemo(
    () => computeRegressions(base.entries, cmp.entries, { matchKey: match }),
    [base, cmp, match],
  );
  const allBoth = useMemo<RegressionRow[]>(
    () => [...result.regressions, ...result.improvements],
    [result],
  );
  const topByTime = useMemo(
    () =>
      [...allBoth]
        .sort((a, b) => Math.abs(b.deltaTime) - Math.abs(a.deltaTime))
        .slice(0, 10),
    [allBoth],
  );
  const topBySize = useMemo(
    () =>
      [...allBoth]
        .sort((a, b) => Math.abs(b.deltaSize) - Math.abs(a.deltaSize))
        .slice(0, 10),
    [allBoth],
  );

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Biggest Movers
        <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
          per-URL median, ranked by |Δ| · {allBoth.length.toLocaleString()} URL
          {allBoth.length === 1 ? "" : "s"} present in both runs · matching by{" "}
          {match === "path" ? "URL path" : "full URL"}
        </span>
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MoverTable
          title={`Top 10 by |Δ time|`}
          rows={topByTime}
          metric="time"
          emptyText="No URLs are present in both runs."
        />
        <MoverTable
          title={`Top 10 by |Δ size|`}
          rows={topBySize}
          metric="size"
          emptyText="No URLs are present in both runs."
        />
      </div>
    </section>
  );
}

function MoverTable({
  title,
  rows,
  metric,
  emptyText,
}: {
  title: string;
  rows: RegressionRow[];
  metric: "time" | "size";
  emptyText: string;
}) {
  // Time has a clear "lower is better" semantic; size is neutral (smaller
  // payloads aren't intrinsically better — sometimes content grew because the
  // app is doing more, not because the build regressed).
  const direction = metric === "time" ? "lower" : "neutral";
  const fmt = metric === "time" ? formatTime : formatBytes;
  const baseVal = (r: RegressionRow) =>
    metric === "time" ? r.baseTime : r.baseSize;
  const cmpVal = (r: RegressionRow) =>
    metric === "time" ? r.cmpTime : r.cmpSize;
  const deltaVal = (r: RegressionRow) =>
    metric === "time" ? r.deltaTime : r.deltaSize;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-500 text-center">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900/40">
              <tr>
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  URL
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Base
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Cmp
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Δ
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  % change
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = deltaVal(r);
                const t = deltaTone(d, direction);
                return (
                  <tr
                    key={r.key}
                    className="border-t border-slate-200 dark:border-slate-700/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-1.5 px-3 max-w-0">
                      <Link
                        href={`/compare?url=${encodeURIComponent(r.url)}`}
                        className="block truncate text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs"
                        title={r.url}
                      >
                        {r.url}
                      </Link>
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                      {fmt(baseVal(r))}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                      {fmt(cmpVal(r))}
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right font-mono text-xs ${t}`}
                    >
                      {formatDelta(d, fmt)}
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right font-mono text-xs font-semibold ${t}`}
                    >
                      {formatPctChange(baseVal(r), cmpVal(r))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
