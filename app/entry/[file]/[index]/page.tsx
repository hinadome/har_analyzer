"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import StatusBadge from "@/components/StatusBadge";
import { useHarStore } from "@/hooks/useHarStore";
import { formatBytes, formatTime } from "@/utils/harParser";
import {
  compareEntryToFile,
  findHeader,
  getEntryByPosition,
  parseUrlQuery,
  reusedConnection,
  throughputKBps,
  type EntryComparison,
  type SizeRank,
  type TimeRank,
} from "@/utils/entryStats";
import { isBinaryEntry, TRUNCATION_LIMIT } from "@/utils/contentDiff";
import { normalizeTiming } from "@/utils/perfStats";
import { TIMING_PHASES } from "@/components/timingPhases";
import type { EntryRecord, HarHeader } from "@/types/har";

export default function EntryDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
          Loading...
        </div>
      }
    >
      <EntryDetailPageContent />
    </Suspense>
  );
}

function EntryDetailPageContent() {
  const params = useParams<{ file: string; index: string }>();
  const fileIndex = Number(params.file);
  const indexInFile = Number(params.index);

  const { store, isLoading } = useHarStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
        Loading...
      </div>
    );
  }

  if (!store || store.analyses.length === 0) {
    return (
      <Shell>
        <NotFound
          title="No HAR loaded"
          message="Load a HAR file from the home page to view entry details."
        />
      </Shell>
    );
  }

  const analysis =
    Number.isInteger(fileIndex) && fileIndex >= 0
      ? store.analyses[fileIndex]
      : null;
  if (!analysis) {
    return (
      <Shell>
        <NotFound
          title="File not loaded"
          message={`No HAR file at index ${params.file}.`}
        />
      </Shell>
    );
  }

  const entry = getEntryByPosition(store, fileIndex, indexInFile);
  if (!entry) {
    return (
      <Shell>
        <NotFound
          title="Entry not found"
          message={`No entry at position ${params.index} in ${analysis.fileName} (this file has ${analysis.entries.length} entries).`}
          extra={
            <Link
              href={`/file/${fileIndex}`}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-300 underline text-sm"
            >
              Browse this file's entries →
            </Link>
          }
        />
      </Shell>
    );
  }

  const comparison =
    analysis.entries.length > 1
      ? compareEntryToFile(entry, analysis.entries)
      : null;

  return (
    <Shell>
      <TitleBlock
        entry={entry}
        fileIndex={fileIndex}
        indexInFile={indexInFile}
        fileName={analysis.fileName}
      />
      <SummaryCard entry={entry} />
      <PerformanceCard entry={entry} comparison={comparison} />
      <RequestCard entry={entry} />
      <ResponseCard entry={entry} />
      <ContentCard entry={entry} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="text-slate-600 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center gap-1.5 text-sm"
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
          <h1 className="text-xl font-bold tracking-tight">HAR Analyzer</h1>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">{children}</main>
    </div>
  );
}

function NotFound({
  title,
  message,
  extra,
}: {
  title: string;
  message: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="text-center py-16 space-y-3">
      <p className="text-slate-700 dark:text-slate-300 text-lg font-medium">
        {title}
      </p>
      <p className="text-slate-600 dark:text-slate-500 text-sm">{message}</p>
      <div className="pt-2 flex items-center justify-center gap-4">
        <Link
          href="/"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-300 underline text-sm"
        >
          ← Back to upload
        </Link>
        {extra}
      </div>
    </div>
  );
}

function TitleBlock({
  entry,
  fileIndex,
  indexInFile,
  fileName,
}: {
  entry: EntryRecord;
  fileIndex: number;
  indexInFile: number;
  fileName: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Link
          href={`/file/${fileIndex}`}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 font-mono break-all"
          title={fileName}
        >
          {fileName}
        </Link>
        <span className="text-slate-500 dark:text-slate-600">·</span>
        <span className="font-mono text-slate-600 dark:text-slate-500">
          entry #{indexInFile}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-mono font-semibold text-slate-700 dark:text-slate-300">
          {entry.method}
        </span>
        <StatusBadge code={entry.status} />
        {entry.statusText && (
          <span className="text-xs font-mono text-slate-600 dark:text-slate-500">
            {entry.statusText}
          </span>
        )}
      </div>
      <h2 className="text-lg sm:text-xl font-mono text-slate-900 dark:text-slate-100 break-all leading-snug">
        {entry.url}
      </h2>
    </div>
  );
}

function SummaryCard({ entry }: { entry: EntryRecord }) {
  const started = entry.startedDateTime
    ? `${new Date(entry.startedDateTime).toLocaleString("en-US", { timeZone: "UTC" })} UTC`
    : "—";
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: "Method",
      value: <span className="font-mono">{entry.method}</span>,
    },
    {
      label: "Status",
      value: (
        <span className="font-mono">
          {entry.status}
          {entry.statusText ? ` ${entry.statusText}` : ""}
        </span>
      ),
    },
    {
      label: "Content-Type",
      value: (
        <span className="font-mono break-all">{entry.contentType || "—"}</span>
      ),
    },
    {
      label: "Size",
      value: (
        <span className="font-mono">{formatBytes(entry.contentSize)}</span>
      ),
    },
    {
      label: "Total time",
      value: <span className="font-mono">{formatTime(entry.time)}</span>,
    },
    {
      label: "Server IP",
      value: <span className="font-mono">{entry.serverIPAddress || "—"}</span>,
    },
    { label: "Started", value: <span className="font-mono">{started}</span> },
  ];
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
      <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Summary
        </h3>
      </header>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-sm">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-slate-600 dark:text-slate-500 uppercase tracking-wider">
              {label}
            </dt>
            <dd className="text-slate-800 dark:text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PerformanceCard({
  entry,
  comparison,
}: {
  entry: EntryRecord;
  comparison: EntryComparison | null;
}) {
  const timings = entry.timings;
  const total = TIMING_PHASES.reduce(
    (s, { key }) => s + normalizeTiming(timings[key]),
    0,
  );
  const throughput = throughputKBps(entry);
  const reused = reusedConnection(timings);
  const cacheControl = findHeader(entry.responseHeaders, "Cache-Control");
  const fromCacheHeader = findHeader(entry.responseHeaders, "X-From-Cache");

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
      <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Performance
        </h3>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-500">
          {formatTime(entry.time)} total
        </span>
      </header>
      <div className="px-5 py-4 space-y-4">
        {total <= 0 ? (
          <p className="text-slate-600 dark:text-slate-500 text-xs italic">
            No timing data available.
          </p>
        ) : (
          <>
            <StackedTimingBar timings={timings} total={total} />
            <TimingPhaseGrid timings={timings} total={total} />
          </>
        )}
        <HintsRow
          reused={reused}
          throughput={throughput}
          cacheControl={cacheControl}
          fromCacheHeader={fromCacheHeader}
        />
        {comparison && <ContextStrip entry={entry} comparison={comparison} />}
      </div>
    </section>
  );
}

function StackedTimingBar({
  timings,
  total,
}: {
  timings: EntryRecord["timings"];
  total: number;
}) {
  return (
    <div className="flex h-4 rounded overflow-hidden gap-px">
      {TIMING_PHASES.map(({ key, label, bar }) => {
        const ms = normalizeTiming(timings[key]);
        const pct = (ms / total) * 100;
        if (pct < 0.5) return null;
        return (
          <div
            key={key}
            className={`${bar} transition-all`}
            style={{ width: `${pct}%` }}
            title={`${label}: ${formatTime(ms)} (${pct.toFixed(1)}%)`}
          />
        );
      })}
    </div>
  );
}

function TimingPhaseGrid({
  timings,
  total,
}: {
  timings: EntryRecord["timings"];
  total: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {TIMING_PHASES.map(({ key, label, text, dot }) => {
        const raw = timings[key];
        const ms = normalizeTiming(raw);
        const pct = total > 0 ? (ms / total) * 100 : 0;
        const missing = typeof raw !== "number" || raw < 0;
        return (
          <div key={key} className="flex items-start gap-2">
            <span className={`mt-1 w-2.5 h-2.5 rounded-sm shrink-0 ${dot}`} />
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-500">
                {label}
              </p>
              <p className={`text-sm font-mono font-semibold ${text}`}>
                {missing ? "—" : formatTime(ms)}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-600">
                {missing ? "—" : `${pct.toFixed(1)}%`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HintsRow({
  reused,
  throughput,
  cacheControl,
  fromCacheHeader,
}: {
  reused: boolean;
  throughput: number | null;
  cacheControl: string | null;
  fromCacheHeader: string | null;
}) {
  const chips: React.ReactNode[] = [];
  chips.push(
    <Chip
      key="conn"
      tone={reused ? "green" : "slate"}
      label={reused ? "Reused connection" : "New connection"}
    />,
  );
  if (throughput !== null) {
    chips.push(
      <Chip
        key="throughput"
        tone="slate"
        label={`${throughput.toFixed(1)} KB/s`}
      />,
    );
  }
  if (cacheControl) {
    chips.push(
      <Chip
        key="cache-control"
        tone="slate"
        label={`Cache-Control: ${cacheControl}`}
      />,
    );
  }
  if (fromCacheHeader) {
    chips.push(<Chip key="from-cache" tone="amber" label="From cache" />);
  }
  return <div className="flex flex-wrap gap-2">{chips}</div>;
}

function ContextStrip({
  entry,
  comparison,
}: {
  entry: EntryRecord;
  comparison: EntryComparison | null;
}) {
  if (!comparison || comparison.samples === 0) return null;
  return (
    <div className="border-t border-slate-200 dark:border-slate-800 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-600 dark:text-slate-500 uppercase tracking-wider">
          Time
        </span>
        <Chip
          tone={TIME_TONE[comparison.timeRank]}
          label={TIME_LABEL[comparison.timeRank]}
        />
        <span className="font-mono text-slate-600 dark:text-slate-500">
          {formatTime(entry.time)} · file P50 {formatTime(comparison.p50)} · P95{" "}
          {formatTime(comparison.p95)} · P99 {formatTime(comparison.p99)} ·{" "}
          {comparison.samples} samples
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-600 dark:text-slate-500 uppercase tracking-wider">
          Size
        </span>
        <Chip
          tone={SIZE_TONE[comparison.sizeRank]}
          label={SIZE_LABEL[comparison.sizeRank]}
        />
        <span className="font-mono text-slate-600 dark:text-slate-500">
          {formatBytes(entry.contentSize)} · file median{" "}
          {formatBytes(comparison.medianSize)} · P90{" "}
          {formatBytes(comparison.p90Size)}
        </span>
      </div>
    </div>
  );
}

type ChipTone = "green" | "slate" | "amber" | "red";

function Chip({ tone, label }: { tone: ChipTone; label: string }) {
  const toneClass = CHIP_TONES[tone];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${toneClass}`}
    >
      {label}
    </span>
  );
}

const CHIP_TONES: Record<ChipTone, string> = {
  green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const TIME_LABEL: Record<TimeRank, string> = {
  "faster-than-p50": "Faster than median",
  "between-p50-p95": "Typical (P50–P95)",
  "slower-than-p95": "Slower than P95",
  "slower-than-p99": "Slower than P99",
};

const TIME_TONE: Record<TimeRank, ChipTone> = {
  "faster-than-p50": "green",
  "between-p50-p95": "slate",
  "slower-than-p95": "amber",
  "slower-than-p99": "red",
};

const SIZE_LABEL: Record<SizeRank, string> = {
  "below-median": "Below median",
  "above-median": "Above median",
  "top-decile": "Top 10% by size",
};

const SIZE_TONE: Record<SizeRank, ChipTone> = {
  "below-median": "green",
  "above-median": "amber",
  "top-decile": "red",
};

function RequestCard({ entry }: { entry: EntryRecord }) {
  const query = useMemo(() => parseUrlQuery(entry.url), [entry.url]);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
      <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Request
        </h3>
      </header>
      <div className="px-5 py-4 space-y-5">
        <KvSubsection title="Headers" count={entry.requestHeaders.length}>
          <HeaderTable headers={entry.requestHeaders} />
        </KvSubsection>
        <KvSubsection title="Cookies" count={entry.requestCookies.length}>
          <CookieTable cookies={entry.requestCookies} />
        </KvSubsection>
        <KvSubsection title="Query string" count={query.length}>
          <CookieTable cookies={query} emptyLabel="No query string." />
        </KvSubsection>
      </div>
    </section>
  );
}

function ResponseCard({ entry }: { entry: EntryRecord }) {
  const setCookieRaw = useMemo(
    () =>
      entry.responseHeaders.filter(
        (h) => h.name.toLowerCase() === "set-cookie",
      ),
    [entry.responseHeaders],
  );
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
      <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Response
        </h3>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-500">
          {entry.status}
          {entry.statusText ? ` ${entry.statusText}` : ""}
        </span>
      </header>
      <div className="px-5 py-4 space-y-5">
        <KvSubsection title="Headers" count={entry.responseHeaders.length}>
          <HeaderTable headers={entry.responseHeaders} />
        </KvSubsection>
        <KvSubsection title="Cookies" count={entry.responseCookies.length}>
          <CookieTable cookies={entry.responseCookies} />
        </KvSubsection>
        {setCookieRaw.length > 0 && (
          <KvSubsection
            title="Set-Cookie (raw)"
            count={setCookieRaw.length}
            note="Full header values including attributes (Path, HttpOnly, …) that the parsed cookies list omits."
          >
            <ul className="space-y-1.5">
              {setCookieRaw.map((h, i) => (
                <li
                  key={i}
                  className="px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 break-all"
                >
                  {h.value}
                </li>
              ))}
            </ul>
          </KvSubsection>
        )}
      </div>
    </section>
  );
}

function ContentCard({ entry }: { entry: EntryRecord }) {
  const binary = isBinaryEntry(entry);
  const body = entry.responseContent ?? "";
  const fullLength = body.length;
  const [showFull, setShowFull] = useState(false);
  const truncated = !showFull && fullLength > TRUNCATION_LIMIT;
  const text = truncated ? body.slice(0, TRUNCATION_LIMIT) : body;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
      <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Content
        </h3>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-500">
          {entry.contentType || "—"} · {formatBytes(entry.contentSize)}
        </span>
      </header>
      <div className="px-5 py-4 space-y-3">
        {binary || !body ? (
          <p className="text-slate-600 dark:text-slate-500 text-xs italic">
            {binary
              ? "Binary content (image, font, audio, video, …) — body not displayed."
              : "No response body captured for this entry."}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
              <span className="text-slate-600 dark:text-slate-500 font-mono">
                {truncated
                  ? `Showing first ${TRUNCATION_LIMIT.toLocaleString()} of ${fullLength.toLocaleString()} chars`
                  : `${fullLength.toLocaleString()} chars`}
              </span>
              <div className="flex items-center gap-2">
                {fullLength > TRUNCATION_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowFull((v) => !v)}
                    className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    {showFull ? "Show truncated" : "Show full"}
                  </button>
                )}
                <CopyButton text={body} />
              </div>
            </div>
            <pre className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-3 max-h-[32rem] overflow-auto text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
              {text}
            </pre>
          </>
        )}
      </div>
    </section>
  );
}

function KvSubsection({
  title,
  count,
  note,
  children,
}: {
  title: string;
  count: number;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          {title}
        </h4>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-500">
          {count}
        </span>
      </div>
      {note && (
        <p className="text-xs text-slate-600 dark:text-slate-500 mb-2">
          {note}
        </p>
      )}
      {children}
    </div>
  );
}

function HeaderTable({ headers }: { headers: HarHeader[] }) {
  const [sortAsc, setSortAsc] = useState(false);
  const rows = useMemo(() => {
    if (!sortAsc) return headers;
    return [...headers].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
  }, [headers, sortAsc]);
  if (!headers.length) {
    return (
      <p className="text-xs text-slate-600 dark:text-slate-500 italic">None.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full text-xs">
        <thead className="bg-slate-100 dark:bg-slate-900/70 text-slate-700 dark:text-slate-300">
          <tr>
            <th className="text-left px-3 py-1.5 font-medium w-1/3">
              <button
                type="button"
                onClick={() => setSortAsc((v) => !v)}
                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                title={
                  sortAsc
                    ? "Sorted a–z (click for HAR order)"
                    : "HAR order (click to sort a–z)"
                }
              >
                Name
                <span className="text-slate-500 dark:text-slate-600">
                  {sortAsc ? "↑" : "↕"}
                </span>
              </button>
            </th>
            <th className="text-left px-3 py-1.5 font-medium">Value</th>
          </tr>
        </thead>
        <tbody className="font-mono text-slate-800 dark:text-slate-200">
          {rows.map((h, i) => (
            <tr
              key={i}
              className="border-t border-slate-200 dark:border-slate-800 align-top"
            >
              <td className="px-3 py-1.5 break-all">{h.name}</td>
              <td className="px-3 py-1.5 break-all">{h.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CookieTable({
  cookies,
  emptyLabel = "None.",
}: {
  cookies: Array<{ name: string; value: string }>;
  emptyLabel?: string;
}) {
  if (!cookies.length) {
    return (
      <p className="text-xs text-slate-600 dark:text-slate-500 italic">
        {emptyLabel}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full text-xs">
        <thead className="bg-slate-100 dark:bg-slate-900/70 text-slate-700 dark:text-slate-300">
          <tr>
            <th className="text-left px-3 py-1.5 font-medium w-1/3">Name</th>
            <th className="text-left px-3 py-1.5 font-medium">Value</th>
          </tr>
        </thead>
        <tbody className="font-mono text-slate-800 dark:text-slate-200">
          {cookies.map((c, i) => (
            <tr
              key={i}
              className="border-t border-slate-200 dark:border-slate-800 align-top"
            >
              <td className="px-3 py-1.5 break-all">{c.name}</td>
              <td className="px-3 py-1.5 break-all">{c.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked (insecure context, permissions); silently no-op.
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
