"use client";

import { Fragment, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useHarStore } from "@/hooks/useHarStore";
import { formatBytes, formatTime } from "@/utils/harParser";
import {
  computePerfStats,
  computeTimingAvgs,
  computeHistogram,
  computeContentTypePerf,
  TIMING_PHASE_KEYS,
  type HistogramScale,
  type PerfStats,
  type TimingAvgs,
  type ContentTypePerfRow,
  type HistogramResult,
} from "@/utils/perfStats";
import type { HarAnalysis, EntryRecord } from "@/types/har";

// ---------------------------------------------------------------------------
// Constants — color palette mirrors components/ComparisonTable + /compare
// ---------------------------------------------------------------------------

const TIMING_PHASES = [
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
] as const;

// 10 distinguishable Tailwind hues, cycled when more files are loaded.
const FILE_COLORS = [
  {
    bar: "bg-blue-500",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  {
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    bar: "bg-purple-500",
    dot: "bg-purple-500",
    text: "text-purple-600 dark:text-purple-400",
  },
  {
    bar: "bg-pink-500",
    dot: "bg-pink-500",
    text: "text-pink-600 dark:text-pink-400",
  },
  {
    bar: "bg-cyan-500",
    dot: "bg-cyan-500",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  {
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
  },
  {
    bar: "bg-indigo-500",
    dot: "bg-indigo-500",
    text: "text-indigo-600 dark:text-indigo-400",
  },
] as const;

const fileColor = (i: number) => FILE_COLORS[i % FILE_COLORS.length];

// ---------------------------------------------------------------------------
// URL state helpers
// ---------------------------------------------------------------------------

interface PerfQuery {
  scale: HistogramScale;
}

function parseQuery(sp: URLSearchParams): PerfQuery {
  const scale: HistogramScale = sp.get("scale") === "linear" ? "linear" : "log";
  return { scale };
}

// ---------------------------------------------------------------------------
// Page entry
// ---------------------------------------------------------------------------

export default function PerformancePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
          Loading...
        </div>
      }
    >
      <PerformancePageContent />
    </Suspense>
  );
}

function PerformancePageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()));

  const setQuery = (patch: Partial<PerfQuery>) => {
    const next = new URLSearchParams(sp.toString());
    const merged = { ...q, ...patch };
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
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-600 dark:text-slate-400 text-lg">
            No HAR files loaded.
          </p>
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Back to upload
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <PageHeader />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        <PageTitle fileCount={analyses.length} />
        <LegendBar analyses={analyses} />
        <KpiMatrix analyses={analyses} />
        <TimingPhaseComparison analyses={analyses} />
        <Histogram analyses={analyses} query={q} setQuery={setQuery} />
        <ContentTypePerf analyses={analyses} />
        <CombinedTopN analyses={analyses} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10 transition-colors">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
        <Link
          href="/"
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
          Back
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
              d="M3 13l4-4 4 4 6-6m4 0v6m0-6h-6"
            />
          </svg>
          <h1 className="text-xl font-bold tracking-tight">Performance</h1>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function PageTitle({ fileCount }: { fileCount: number }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Performance Dashboard
      </h2>
      <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
        Cross-file performance analysis across {fileCount.toLocaleString()}{" "}
        loaded HAR file{fileCount !== 1 ? "s" : ""}.
      </p>
    </div>
  );
}

function LegendBar({ analyses }: { analyses: HarAnalysis[] }) {
  const canCompare = analyses.length >= 2;
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-500 flex-wrap">
        <span className="uppercase tracking-wider">Files:</span>
        {analyses.map((a, i) => {
          const c = fileColor(i);
          return (
            <span
              key={i}
              className="flex items-center gap-1.5"
              title={a.fileName}
            >
              <span className={`w-2.5 h-2.5 rounded-sm ${c.dot}`} />
              <span className="font-mono truncate max-w-[140px]">
                {a.fileName}
              </span>
            </span>
          );
        })}
      </div>
      {canCompare && (
        <Link
          href="/performance/diff"
          className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-600/40 dark:border-blue-400/40 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-sm font-medium transition-colors"
          title="Side-by-side baseline vs compare deltas"
        >
          Compare two runs
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: per-file KPI matrix
// ---------------------------------------------------------------------------

function formatWallClock(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function KpiMatrix({ analyses }: { analyses: HarAnalysis[] }) {
  const stats = useMemo(
    () => analyses.map((a) => ({ a, s: computePerfStats(a.entries) })),
    [analyses],
  );
  const errorClass = (rate: number) =>
    rate >= 5
      ? "text-red-600 dark:text-red-400"
      : rate >= 1
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-700 dark:text-slate-300";

  const rows: Array<{
    label: string;
    render: (s: PerfStats) => React.ReactNode;
  }> = [
    { label: "Total Requests", render: (s) => s.count.toLocaleString() },
    { label: "Total Bytes", render: (s) => formatBytes(s.totalBytes) },
    { label: "Wall-clock", render: (s) => formatWallClock(s.wallClockMs) },
    { label: "Avg Time", render: (s) => formatTime(s.avgTime) },
    { label: "P50", render: (s) => formatTime(s.p50) },
    { label: "P75", render: (s) => formatTime(s.p75) },
    { label: "P95", render: (s) => formatTime(s.p95) },
    { label: "P99", render: (s) => formatTime(s.p99) },
    { label: "Slowest", render: (s) => formatTime(s.maxTime) },
    {
      label: "Error Rate",
      render: (s) => (
        <span className={errorClass(s.errorRate)}>
          {s.errorRate.toFixed(1)}%{" "}
          <span className="text-xs text-slate-500 dark:text-slate-600">
            ({s.errorCount.toLocaleString()})
          </span>
        </span>
      ),
    },
  ];

  const thClass =
    "py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60";
  const tdClass =
    "py-2.5 px-4 text-sm text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700/50 text-right font-mono";
  const labelTdClass =
    "py-2.5 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700/50";

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Per-file KPIs
      </h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${thClass} w-48`}>Metric</th>
              {stats.map(({ a }, i) => {
                const c = fileColor(i);
                return (
                  <th key={i} className={`${thClass} text-right min-w-[140px]`}>
                    <span className="flex items-center justify-end gap-2">
                      <span className={`w-2 h-2 rounded-sm ${c.dot}`} />
                      <span
                        className="block truncate max-w-[160px] font-mono normal-case"
                        title={a.fileName}
                      >
                        {a.fileName}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <td className={labelTdClass}>{row.label}</td>
                {stats.map(({ s }, i) => (
                  <td key={i} className={tdClass}>
                    {row.render(s)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: avg timing-phase comparison
// ---------------------------------------------------------------------------

function TimingPhaseComparison({ analyses }: { analyses: HarAnalysis[] }) {
  const data = useMemo(
    () => analyses.map((a) => ({ a, t: computeTimingAvgs(a.entries) })),
    [analyses],
  );
  const maxTotal = data.reduce((m, d) => Math.max(m, d.t.total), 0) || 1;

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Avg Timing-Phase Breakdown
        <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
          per request — bars share the same axis
        </span>
      </h3>
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        {data.map(({ a, t }, i) => (
          <TimingPhaseRow
            key={i}
            fileName={a.fileName}
            timing={t}
            maxTotal={maxTotal}
          />
        ))}
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-2 border-t border-slate-200 dark:border-slate-700/50">
          {TIMING_PHASES.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5 text-xs">
              <span className={`w-2.5 h-2.5 rounded-sm ${p.color}`} />
              <span className={p.text}>{p.label}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function TimingPhaseRow({
  fileName,
  timing,
  maxTotal,
}: {
  fileName: string;
  timing: TimingAvgs;
  maxTotal: number;
}) {
  const widthPct = (timing.total / maxTotal) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate max-w-[60%]"
          title={fileName}
        >
          {fileName}
        </span>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
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

// ---------------------------------------------------------------------------
// Section: response-time distribution histogram
// ---------------------------------------------------------------------------

function Histogram({
  analyses,
  query,
  setQuery,
}: {
  analyses: HarAnalysis[];
  query: PerfQuery;
  setQuery: (p: Partial<PerfQuery>) => void;
}) {
  const histogram = useMemo<HistogramResult>(
    () =>
      computeHistogram(
        analyses.map((a) => a.entries),
        { scale: query.scale, bins: 10 },
      ),
    [analyses, query.scale],
  );
  const maxCount =
    histogram.counts.reduce((m, row) => Math.max(m, ...row), 0) || 1;
  const bins = histogram.counts[0]?.length ?? 0;

  const tabBase = "px-3 py-1 text-xs font-medium rounded transition-colors";
  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          Response-Time Distribution
          <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
            shared {query.scale} axis across all files
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
        {bins === 0 ? (
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
              return (
                <div key={binIdx} className="flex flex-col">
                  <div className="flex items-end gap-0.5 h-32">
                    {histogram.counts.map((row, fileIdx) => {
                      const count = row[binIdx] ?? 0;
                      const h = (count / maxCount) * 100;
                      const c = fileColor(fileIdx);
                      return (
                        <div
                          key={fileIdx}
                          className={`flex-1 ${c.bar} rounded-t-sm transition-all hover:opacity-80`}
                          style={{
                            height: `${Math.max(count > 0 ? 2 : 0, h)}%`,
                          }}
                          title={`${analyses[fileIdx].fileName}: ${count.toLocaleString()} requests in ${formatTime(lo)}–${formatTime(hi)}`}
                        />
                      );
                    })}
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
        <p className="text-xs text-slate-500 dark:text-slate-600 mt-3">
          Buckets are derived once from the combined min/max across all files,
          so bars are directly comparable.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: per content-type performance
// ---------------------------------------------------------------------------

function ContentTypePerf({ analyses }: { analyses: HarAnalysis[] }) {
  // Per-file rows keyed by content-type, then unioned for display.
  const perFile = useMemo(
    () =>
      analyses.map((a) => {
        const map = new Map<string, ContentTypePerfRow>();
        for (const r of computeContentTypePerf(a.entries))
          map.set(r.contentType, r);
        return map;
      }),
    [analyses],
  );
  const allTypes = useMemo(() => {
    const totals = new Map<string, number>();
    for (const m of perFile) {
      for (const [ct, row] of m)
        totals.set(ct, (totals.get(ct) ?? 0) + row.count);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([ct]) => ct);
  }, [perFile]);

  const thClass =
    "py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60";
  const tdClass =
    "py-2 px-3 text-sm text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700/50 font-mono";

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Per Content-Type Performance
      </h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${thClass} text-left sticky left-0 z-10`}>
                Content type
              </th>
              {analyses.map((a, i) => {
                const c = fileColor(i);
                return (
                  <th key={i} className={`${thClass} text-right`} colSpan={4}>
                    <span className="flex items-center justify-end gap-2">
                      <span className={`w-2 h-2 rounded-sm ${c.dot}`} />
                      <span
                        className="block truncate max-w-[160px] font-mono normal-case"
                        title={a.fileName}
                      >
                        {a.fileName}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
            <tr>
              <th
                className={`${thClass} text-left sticky left-0 z-10`}
                aria-label="Content type column"
              >
                <span className="sr-only">Content type</span>
              </th>
              {analyses.map((_, i) => (
                <Fragment key={i}>
                  <th className={`${thClass} text-right`}>Count</th>
                  <th className={`${thClass} text-right`}>Bytes</th>
                  <th className={`${thClass} text-right`}>Avg</th>
                  <th className={`${thClass} text-right`}>P95</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {allTypes.length === 0 ? (
              <tr>
                <td
                  className={`${tdClass} text-center text-slate-500`}
                  colSpan={1 + analyses.length * 4}
                >
                  No entries.
                </td>
              </tr>
            ) : (
              allTypes.map((ct) => (
                <tr
                  key={ct}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-2 px-3 text-sm text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700/50 font-mono sticky left-0 bg-white dark:bg-slate-950 z-10">
                    {ct}
                  </td>
                  {perFile.map((m, i) => {
                    const row = m.get(ct);
                    return (
                      <Fragment key={i}>
                        <td className={`${tdClass} text-right`}>
                          {row ? row.count.toLocaleString() : "—"}
                        </td>
                        <td className={`${tdClass} text-right`}>
                          {row ? formatBytes(row.totalBytes) : "—"}
                        </td>
                        <td className={`${tdClass} text-right`}>
                          {row ? formatTime(row.avgTime) : "—"}
                        </td>
                        <td className={`${tdClass} text-right`}>
                          {row ? formatTime(row.p95Time) : "—"}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: combined slowest / largest top-10
// ---------------------------------------------------------------------------

interface TaggedEntry {
  fileIdx: number;
  fileName: string;
  entry: EntryRecord;
}

function CombinedTopN({ analyses }: { analyses: HarAnalysis[] }) {
  const tagged = useMemo<TaggedEntry[]>(() => {
    const out: TaggedEntry[] = [];
    analyses.forEach((a, i) => {
      for (const e of a.entries)
        out.push({ fileIdx: i, fileName: a.fileName, entry: e });
    });
    return out;
  }, [analyses]);

  const slowest = useMemo(
    () =>
      [...tagged]
        .filter((t) => Number.isFinite(t.entry.time))
        .sort((a, b) => b.entry.time - a.entry.time)
        .slice(0, 10),
    [tagged],
  );
  const largest = useMemo(
    () =>
      [...tagged]
        .filter((t) => Number.isFinite(t.entry.contentSize))
        .sort((a, b) => b.entry.contentSize - a.entry.contentSize)
        .slice(0, 10),
    [tagged],
  );

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
        Combined Top-10 (across all files)
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CombinedTable
          title="Slowest 10"
          rows={slowest}
          valueLabel="Time"
          formatValue={(e) => formatTime(e.time)}
        />
        <CombinedTable
          title="Largest 10"
          rows={largest}
          valueLabel="Size"
          formatValue={(e) => formatBytes(e.contentSize)}
        />
      </div>
    </section>
  );
}

function CombinedTable({
  title,
  rows,
  valueLabel,
  formatValue,
}: {
  title: string;
  rows: TaggedEntry[];
  valueLabel: string;
  formatValue: (e: EntryRecord) => string;
}) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-500 text-center">
          No entries.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-900/40">
            <tr>
              <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                File
              </th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                URL
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, idx) => {
              const c = fileColor(t.fileIdx);
              return (
                <tr
                  key={`${t.fileIdx}-${idx}`}
                  className="border-t border-slate-200 dark:border-slate-700/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-1.5 px-3">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-sm ${c.dot}`} />
                      <span
                        className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate max-w-[120px] block"
                        title={t.fileName}
                      >
                        {t.fileName}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 px-3 max-w-0">
                    <Link
                      href={`/compare?url=${encodeURIComponent(t.entry.url)}`}
                      className="block truncate text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs"
                      title={t.entry.url}
                    >
                      {t.entry.url}
                    </Link>
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                    {formatValue(t.entry)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
