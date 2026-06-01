"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import StatusBadge from "@/components/StatusBadge";
import { useHarStore } from "@/hooks/useHarStore";
import { formatTime } from "@/utils/harParser";
import {
  analyzeStore,
  corsEntryId,
  CORS_REQUEST_HEADERS,
  CORS_RESPONSE_HEADERS,
  getHeader,
  PREFLIGHT_SLOW_MS,
  type CorsEntry,
  type CorsFileReport,
  type CorsFinding,
  type CorsPair,
  type CorsReport,
  type CorsSeverity,
} from "@/utils/corsAnalysis";
import type { HarAnalysis } from "@/types/har";

// ---------------------------------------------------------------------------
// File color palette (kept in sync with /performance + /performance/diff)
// ---------------------------------------------------------------------------

const FILE_COLORS = [
  { dot: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
  { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  { dot: "bg-purple-500", text: "text-purple-600 dark:text-purple-400" },
  { dot: "bg-pink-500", text: "text-pink-600 dark:text-pink-400" },
  { dot: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400" },
  { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  { dot: "bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400" },
] as const;

const fileColor = (i: number) => FILE_COLORS[i % FILE_COLORS.length];

// ---------------------------------------------------------------------------
// URL state helpers
// ---------------------------------------------------------------------------

type FileScope = "all" | number;
type SeverityFilter = "all" | CorsSeverity;

interface CorsQuery {
  file: FileScope;
  severity: SeverityFilter;
  origin: string;
  expand: string;
}

function parseQuery(sp: URLSearchParams, fileCount: number): CorsQuery {
  const fileParam = sp.get("file") ?? "all";
  let file: FileScope = "all";
  if (fileParam !== "all") {
    const n = Number(fileParam);
    if (Number.isInteger(n) && n >= 0 && n < fileCount) file = n;
  }
  const sev = sp.get("severity");
  const severity: SeverityFilter =
    sev === "error" || sev === "warning" || sev === "info" ? sev : "all";
  return {
    file,
    severity,
    origin: sp.get("origin") ?? "",
    expand: sp.get("expand") ?? "",
  };
}

function buildQueryString(q: Partial<CorsQuery>, base: URLSearchParams) {
  const next = new URLSearchParams(base.toString());
  if (q.file !== undefined) {
    if (q.file === "all") next.delete("file");
    else next.set("file", String(q.file));
  }
  if (q.severity !== undefined) {
    if (q.severity === "all") next.delete("severity");
    else next.set("severity", q.severity);
  }
  if (q.origin !== undefined) {
    if (q.origin === "") next.delete("origin");
    else next.set("origin", q.origin);
  }
  if (q.expand !== undefined) {
    if (q.expand === "") next.delete("expand");
    else next.set("expand", q.expand);
  }
  return next.toString();
}

// ---------------------------------------------------------------------------
// Severity styling
// ---------------------------------------------------------------------------

const SEVERITY_STYLE: Record<
  CorsSeverity,
  { dot: string; chip: string; label: string }
> = {
  error: {
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50",
    label: "Error",
  },
  warning: {
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
    label: "Warning",
  },
  info: {
    dot: "bg-slate-400",
    chip: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    label: "Info",
  },
};

// ---------------------------------------------------------------------------
// Page entry
// ---------------------------------------------------------------------------

export default function CorsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
          Loading...
        </div>
      }
    >
      <CorsPageContent />
    </Suspense>
  );
}

function CorsPageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()), analyses.length);

  const setQuery = (patch: Partial<CorsQuery>) => {
    const qs = buildQueryString(patch, new URLSearchParams(sp.toString()));
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const report: CorsReport | null = useMemo(
    () => (analyses.length > 0 ? analyzeStore(analyses) : null),
    [analyses],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
        Loading...
      </div>
    );
  }

  if (analyses.length === 0 || !report) {
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

  const scopedFiles =
    q.file === "all" ? report.files : [report.files[q.file]].filter(Boolean);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <PageHeader />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <PageTitle fileCount={analyses.length} report={report} scope={q.file} />
        <ScopeBar
          analyses={analyses}
          report={report}
          query={q}
          setQuery={setQuery}
        />
        <KpiSummary files={scopedFiles} />
        <IssuesTable
          files={scopedFiles}
          analyses={analyses}
          query={q}
          setQuery={setQuery}
        />
        <PreflightPairsSection files={scopedFiles} analyses={analyses} />
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
              d="M12 11c0-1.657-1.343-3-3-3s-3 1.343-3 3v3a2 2 0 002 2h2a2 2 0 002-2v-3zm6 0c0-1.657-1.343-3-3-3s-3 1.343-3 3v3a2 2 0 002 2h2a2 2 0 002-2v-3zM12 16v3"
            />
          </svg>
          <h1 className="text-xl font-bold tracking-tight">CORS Audit</h1>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function PageTitle({
  fileCount,
  report,
  scope,
}: {
  fileCount: number;
  report: CorsReport;
  scope: FileScope;
}) {
  const inScope = scope === "all" ? "all loaded files" : "1 file";
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        CORS Audit
      </h2>
      <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
        Identifies potential Cross-Origin Resource Sharing issues across{" "}
        {inScope} ({fileCount.toLocaleString()} HAR file
        {fileCount !== 1 ? "s" : ""} loaded · {report.crossOriginCount}{" "}
        cross-origin request{report.crossOriginCount === 1 ? "" : "s"} ·{" "}
        {report.preflightCount} preflight
        {report.preflightCount === 1 ? "" : "s"}).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scope bar — file scope chips + severity filter chips + origin filter
// ---------------------------------------------------------------------------

function ScopeBar({
  analyses,
  report,
  query,
  setQuery,
}: {
  analyses: HarAnalysis[];
  report: CorsReport;
  query: CorsQuery;
  setQuery: (patch: Partial<CorsQuery>) => void;
}) {
  const origins = useMemo(() => {
    const set = new Set<string>();
    for (const f of report.files) {
      for (const e of f.entries) if (e.requestOrigin) set.add(e.requestOrigin);
    }
    return Array.from(set).sort();
  }, [report]);

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mr-1">
          File:
        </span>
        <ScopeChip
          active={query.file === "all"}
          onClick={() => setQuery({ file: "all" })}
        >
          All files ({analyses.length})
        </ScopeChip>
        {analyses.map((a, i) => {
          const c = fileColor(i);
          const r = report.files[i];
          return (
            <ScopeChip
              key={i}
              active={query.file === i}
              onClick={() => setQuery({ file: i })}
              title={a.fileName}
            >
              <span className={`w-2 h-2 rounded-sm ${c.dot} mr-1.5`} />
              <span className="font-mono truncate max-w-[140px]">
                {a.fileName}
              </span>
              <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-500">
                ({r.errorCount + r.warningCount + r.infoCount})
              </span>
            </ScopeChip>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mr-1">
          Severity:
        </span>
        <ScopeChip
          active={query.severity === "all"}
          onClick={() => setQuery({ severity: "all" })}
        >
          All
        </ScopeChip>
        <ScopeChip
          active={query.severity === "error"}
          onClick={() => setQuery({ severity: "error" })}
        >
          <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5" />
          Error
        </ScopeChip>
        <ScopeChip
          active={query.severity === "warning"}
          onClick={() => setQuery({ severity: "warning" })}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
          Warning
        </ScopeChip>
        <ScopeChip
          active={query.severity === "info"}
          onClick={() => setQuery({ severity: "info" })}
        >
          <span className="w-2 h-2 rounded-full bg-slate-400 mr-1.5" />
          Info
        </ScopeChip>
        {origins.length > 1 && (
          <>
            <span className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 ml-3 mr-1">
              Origin:
            </span>
            <select
              value={query.origin}
              onChange={(e) => setQuery({ origin: e.target.value })}
              title="Filter by request Origin"
              aria-label="Filter by request Origin"
              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              <option value="">All origins</option>
              {origins.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
        active
          ? "bg-blue-600 border-blue-600 text-white"
          : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500 dark:hover:border-blue-400"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// KPI summary — 4 cards: total findings, errors, failed preflights, slow PFs
// ---------------------------------------------------------------------------

function KpiSummary({ files }: { files: CorsFileReport[] }) {
  const totals = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    let failedPreflights = 0;
    let preflights = 0;
    let crossOrigin = 0;
    let slowPreflights = 0;
    for (const f of files) {
      errors += f.errorCount;
      warnings += f.warningCount;
      infos += f.infoCount;
      failedPreflights += f.failedPreflightCount;
      preflights += f.preflightCount;
      crossOrigin += f.crossOriginCount;
      for (const e of f.entries) {
        for (const fnd of e.findings) {
          if (fnd.kind === "preflight-slow") slowPreflights++;
        }
      }
    }
    return {
      errors,
      warnings,
      infos,
      failedPreflights,
      preflights,
      crossOrigin,
      slowPreflights,
      total: errors + warnings + infos,
    };
  }, [files]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label="Total findings"
        value={totals.total}
        sub={`${totals.errors} error${totals.errors === 1 ? "" : "s"} · ${totals.warnings} warning${totals.warnings === 1 ? "" : "s"} · ${totals.infos} info`}
        accent={
          totals.errors > 0
            ? "text-red-600 dark:text-red-400"
            : totals.warnings > 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400"
        }
      />
      <KpiCard
        label="Failed preflights"
        value={totals.failedPreflights}
        sub={`out of ${totals.preflights} OPTIONS request${totals.preflights === 1 ? "" : "s"}`}
        accent={
          totals.failedPreflights > 0
            ? "text-red-600 dark:text-red-400"
            : "text-slate-700 dark:text-slate-300"
        }
      />
      <KpiCard
        label="Slow preflights"
        value={totals.slowPreflights}
        sub={`> ${PREFLIGHT_SLOW_MS} ms`}
        accent={
          totals.slowPreflights > 0
            ? "text-amber-600 dark:text-amber-400"
            : "text-slate-700 dark:text-slate-300"
        }
      />
      <KpiCard
        label="Cross-origin requests"
        value={totals.crossOrigin}
        sub="(non-preflight, with Origin header)"
        accent="text-slate-700 dark:text-slate-300"
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  accent: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500">
        {label}
      </div>
      <div className={`text-3xl font-bold tabular-nums mt-1 ${accent}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-slate-600 dark:text-slate-500 mt-1">
        {sub}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issues table — flat list of CORS findings, filtered by scope/severity/origin
// ---------------------------------------------------------------------------

interface IssueRow {
  fileIndex: number;
  fileName: string;
  entry: CorsEntry;
  finding: CorsFinding;
}

const FINDING_KIND_LABEL: Record<CorsFinding["kind"], string> = {
  "preflight-failed": "Preflight failed",
  "preflight-slow": "Slow preflight",
  "acao-missing": "ACAO missing",
  "acao-mismatch": "ACAO mismatch",
  "acao-wildcard-with-credentials": "Wildcard ACAO + credentials",
  "method-not-allowed": "Method not allowed",
  "header-not-allowed": "Header not allowed",
  "credentials-flag-missing": "Credentials flag missing",
  "actual-request-blocked": "Actual request blocked",
};

function IssuesTable({
  files,
  analyses,
  query,
  setQuery,
}: {
  files: CorsFileReport[];
  analyses: HarAnalysis[];
  query: CorsQuery;
  setQuery: (patch: Partial<CorsQuery>) => void;
}) {
  const rows = useMemo<IssueRow[]>(() => {
    const out: IssueRow[] = [];
    for (const f of files) {
      const fileName = analyses[f.fileIndex]?.fileName ?? `file-${f.fileIndex}`;
      for (const e of f.entries) {
        if (query.origin && e.requestOrigin !== query.origin) continue;
        for (const fnd of e.findings) {
          if (query.severity !== "all" && fnd.severity !== query.severity) {
            continue;
          }
          out.push({
            fileIndex: f.fileIndex,
            fileName,
            entry: e,
            finding: fnd,
          });
        }
      }
    }
    // Errors first, then warnings, then info; stable within severity.
    const sevRank: Record<CorsSeverity, number> = {
      error: 0,
      warning: 1,
      info: 2,
    };
    out.sort(
      (a, b) => sevRank[a.finding.severity] - sevRank[b.finding.severity],
    );
    return out;
  }, [files, analyses, query.origin, query.severity]);

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
        <div className="text-emerald-600 dark:text-emerald-400 text-lg font-semibold">
          No CORS issues detected
        </div>
        <p className="text-slate-600 dark:text-slate-500 text-sm mt-2">
          {query.severity !== "all" || query.origin
            ? "No findings match the current filters."
            : "All cross-origin requests in scope passed the audit."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Findings
          <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-500">
            ({rows.length.toLocaleString()})
          </span>
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-20">Severity</th>
              <th className="text-left px-3 py-2 font-medium w-44">Kind</th>
              {query.file === "all" && (
                <th className="text-left px-3 py-2 font-medium w-32">File</th>
              )}
              <th className="text-left px-3 py-2 font-medium w-16">Status</th>
              <th className="text-left px-3 py-2 font-medium w-20">Method</th>
              <th className="text-left px-3 py-2 font-medium">URL</th>
              <th className="text-left px-3 py-2 font-medium w-20">Time</th>
              <th className="text-left px-3 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((r, i) => (
              <IssueRowView
                key={`${corsEntryId(r.entry)}:${r.finding.kind}:${i}`}
                row={r}
                showFileColumn={query.file === "all"}
                expanded={query.expand === corsEntryId(r.entry)}
                onToggleExpand={() =>
                  setQuery({
                    expand:
                      query.expand === corsEntryId(r.entry)
                        ? ""
                        : corsEntryId(r.entry),
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssueRowView({
  row,
  showFileColumn,
  expanded,
  onToggleExpand,
}: {
  row: IssueRow;
  showFileColumn: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { entry, finding } = row;
  const ent = entry.entry;
  const sev = SEVERITY_STYLE[finding.severity];
  const c = fileColor(row.fileIndex);
  const colCount = showFileColumn ? 8 : 7;
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  // Deep-link: scroll into view the first time this row mounts in the
  // expanded state (e.g. when the page is loaded with ?expand=...).
  useEffect(() => {
    if (expanded && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "center", behavior: "auto" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Fragment>
      <tr
        ref={rowRef}
        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors ${expanded ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}
        onClick={onToggleExpand}
      >
        <td className="px-3 py-2 align-top">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${sev.chip}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${sev.dot} mr-1`} />
            {sev.label}
          </span>
        </td>
        <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 text-xs">
          {FINDING_KIND_LABEL[finding.kind]}
        </td>
        {showFileColumn && (
          <td className="px-3 py-2 align-top">
            <span
              className={`inline-flex items-center text-xs ${c.text}`}
              title={row.fileName}
            >
              <span className={`w-2 h-2 rounded-sm ${c.dot} mr-1.5`} />
              <span className="font-mono truncate max-w-[120px]">
                {row.fileName}
              </span>
            </span>
          </td>
        )}
        <td className="px-3 py-2 align-top">
          <StatusBadge code={ent.status} />
        </td>
        <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
          {ent.method}
          {entry.isPreflight && (
            <span className="ml-1 text-[10px] uppercase text-blue-600 dark:text-blue-400">
              PF
            </span>
          )}
        </td>
        <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300 break-all max-w-[480px]">
          {ent.url}
        </td>
        <td className="px-3 py-2 align-top tabular-nums text-xs text-slate-700 dark:text-slate-300">
          {formatTime(ent.time)}
        </td>
        <td className="px-3 py-2 align-top text-xs text-slate-600 dark:text-slate-400">
          {finding.message}
          <span className="ml-2 inline-block text-slate-400 dark:text-slate-600">
            {expanded ? "▾" : "▸"}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/70 dark:bg-slate-900/40">
          <td colSpan={colCount} className="p-0">
            <HandshakePanel entry={entry} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// ---------------------------------------------------------------------------
// Handshake panel — 2-column request / response grid + findings list
// ---------------------------------------------------------------------------

function HandshakePanel({ entry }: { entry: CorsEntry }) {
  const ent = entry.entry;
  // Filter request headers shown: only ACR* are preflight-specific; Origin
  // applies to all CORS requests. We always display Origin first.
  const reqHeaderNames = entry.isPreflight
    ? CORS_REQUEST_HEADERS
    : (["Origin"] as const);
  const reqRows = reqHeaderNames.map((name) => ({
    name,
    value: getHeader(ent.requestHeaders, name),
  }));
  const resRows = CORS_RESPONSE_HEADERS.map((name) => ({
    name,
    value: getHeader(ent.responseHeaders, name),
  }));
  return (
    <div className="px-6 py-4 border-y border-slate-200 dark:border-slate-800 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HeaderColumn
          title="Request"
          subtitle={`${ent.method} ${entry.isPreflight ? "(preflight)" : ""}`}
          rows={reqRows}
          fileIndex={entry.fileIndex}
          searchScope="rh"
          extra={
            !entry.isPreflight && entry.credentialed ? (
              <div className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                Credentialed — request carries Cookie / Authorization
              </div>
            ) : null
          }
        />
        <HeaderColumn
          title="Response"
          subtitle={`HTTP ${ent.status}${ent.statusText ? " " + ent.statusText : ""}`}
          rows={resRows}
          fileIndex={entry.fileIndex}
          searchScope="sh"
        />
      </div>
      {entry.findings.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
          <div className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-2">
            Findings ({entry.findings.length})
          </div>
          <ul className="space-y-1.5">
            {entry.findings.map((f, i) => (
              <FindingItem key={i} finding={f} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HeaderColumn({
  title,
  subtitle,
  rows,
  fileIndex,
  searchScope,
  extra,
}: {
  title: string;
  subtitle?: string;
  rows: ReadonlyArray<{ name: string; value: string | undefined }>;
  /** File index to pass through to the kv-search deep link. */
  fileIndex: number;
  /** Scope token for the kv-search deep link (`rh` or `sh`). */
  searchScope: "rh" | "sh";
  extra?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs font-mono text-slate-500 dark:text-slate-500">
            {subtitle}
          </div>
        )}
      </div>
      <dl className="space-y-1.5">
        {rows.map((r) => {
          const href = `/kv-search?name=${encodeURIComponent(r.name)}&scope=${searchScope}&file=${fileIndex}`;
          return (
            <div
              key={r.name}
              className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-2 text-xs"
            >
              <dt className="font-mono text-slate-600 dark:text-slate-500 truncate">
                <Link
                  href={href}
                  title={`Search ${title.toLowerCase()} headers for ${r.name}`}
                  className="hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
                >
                  {r.name}
                </Link>
              </dt>
              <dd
                className={`font-mono break-all ${r.value ? "text-slate-800 dark:text-slate-200" : "text-slate-400 dark:text-slate-600 italic"}`}
              >
                {r.value ?? "—"}
              </dd>
            </div>
          );
        })}
      </dl>
      {extra}
    </div>
  );
}

function FindingItem({ finding }: { finding: CorsFinding }) {
  const sev = SEVERITY_STYLE[finding.severity];
  const icon =
    finding.severity === "error"
      ? "✗"
      : finding.severity === "warning"
        ? "⚠"
        : "•";
  return (
    <li className="flex items-start gap-2 text-xs">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full font-bold ${sev.chip}`}
      >
        {icon}
      </span>
      <div className="flex-1">
        <div className="text-slate-800 dark:text-slate-200">
          {finding.message}
        </div>
        {finding.detail && (
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
            {finding.detail.sent !== undefined && (
              <DetailCell label="Sent" value={finding.detail.sent} />
            )}
            {finding.detail.expected !== undefined && (
              <DetailCell label="Expected" value={finding.detail.expected} />
            )}
            {finding.detail.received !== undefined && (
              <DetailCell label="Received" value={finding.detail.received} />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded px-2 py-1">
      <div className="text-slate-500 dark:text-slate-500 uppercase tracking-wider text-[9px]">
        {label}
      </div>
      <div className="text-slate-800 dark:text-slate-200 break-all">
        {value || <span className="italic text-slate-400">(empty)</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preflight pairs section — OPTIONS chained with its actual request
// ---------------------------------------------------------------------------

interface PairRow {
  fileIndex: number;
  fileName: string;
  pair: CorsPair;
}

function PreflightPairsSection({
  files,
  analyses,
}: {
  files: CorsFileReport[];
  analyses: HarAnalysis[];
}) {
  const rows = useMemo<PairRow[]>(() => {
    const out: PairRow[] = [];
    for (const f of files) {
      const fileName = analyses[f.fileIndex]?.fileName ?? `file-${f.fileIndex}`;
      for (const p of f.pairs) {
        out.push({ fileIndex: f.fileIndex, fileName, pair: p });
      }
    }
    return out;
  }, [files, analyses]);

  if (rows.length === 0) return null;

  return (
    <details className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl group">
      <summary className="px-4 py-3 cursor-pointer flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
        <span className="text-slate-400 dark:text-slate-600 group-open:rotate-90 inline-block transition-transform">
          ▸
        </span>
        Preflight pairs
        <span className="ml-1 text-xs font-normal text-slate-600 dark:text-slate-500">
          ({rows.length.toLocaleString()})
        </span>
      </summary>
      <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
        {rows.map((r, i) => (
          <PairCard key={i} row={r} />
        ))}
      </div>
    </details>
  );
}

function PairCard({ row }: { row: PairRow }) {
  const { pair, fileName, fileIndex } = row;
  const c = fileColor(fileIndex);
  const pre = pair.preflight.entry;
  const act = pair.actual?.entry;
  const verdictColor = pairVerdictColor(pair);
  const verdictLabel = pairVerdictLabel(pair);
  const startMs = (() => {
    if (!act) return null;
    const a = Date.parse(act.startedDateTime);
    const p = Date.parse(pre.startedDateTime);
    return Number.isFinite(a) && Number.isFinite(p) ? a - p : null;
  })();
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 text-xs">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${verdictColor}`}
        >
          {verdictLabel}
        </span>
        <span className={`inline-flex items-center ${c.text}`} title={fileName}>
          <span className={`w-2 h-2 rounded-sm ${c.dot} mr-1.5`} />
          <span className="font-mono truncate max-w-[180px]">{fileName}</span>
        </span>
        {startMs !== null && (
          <span className="text-slate-500 dark:text-slate-500">
            Δ start {startMs} ms
          </span>
        )}
      </div>
      <PairRowLine
        label="OPTIONS"
        method={pre.method}
        status={pre.status}
        url={pre.url}
        time={pre.time}
        accent="border-blue-500 dark:border-blue-400"
      />
      {act ? (
        <PairRowLine
          label="Actual"
          method={act.method}
          status={act.status}
          url={act.url}
          time={act.time}
          accent="border-emerald-500 dark:border-emerald-400"
        />
      ) : (
        <div className="ml-4 pl-3 py-1 border-l-2 border-red-500 dark:border-red-400 text-xs text-red-700 dark:text-red-300">
          No matching actual request found within {(5000).toLocaleString()} ms —
          the preflight may have blocked it.
        </div>
      )}
    </div>
  );
}

function PairRowLine({
  label,
  method,
  status,
  url,
  time,
  accent,
}: {
  label: string;
  method: string;
  status: number;
  url: string;
  time: number;
  accent: string;
}) {
  return (
    <div className={`ml-4 pl-3 py-1 border-l-2 ${accent}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500 dark:text-slate-500 uppercase tracking-wider w-16">
          {label}
        </span>
        <StatusBadge code={status} />
        <span className="font-mono text-slate-700 dark:text-slate-300">
          {method}
        </span>
        <span className="font-mono text-slate-600 dark:text-slate-400 break-all flex-1">
          {url}
        </span>
        <span className="tabular-nums text-slate-600 dark:text-slate-400">
          {formatTime(time)}
        </span>
      </div>
    </div>
  );
}

function pairVerdictLabel(pair: CorsPair): string {
  const preFailed = pair.preflight.findings.some(
    (f) => f.kind === "preflight-failed",
  );
  if (preFailed) return "Preflight failed";
  if (!pair.actual) return "No actual request";
  const errs = pair.actual.findings.some((f) => f.severity === "error");
  if (errs) return "Actual blocked";
  const warns =
    pair.preflight.findings.some((f) => f.severity === "warning") ||
    pair.actual.findings.some((f) => f.severity === "warning");
  if (warns) return "Warnings";
  return "OK";
}

function pairVerdictColor(pair: CorsPair): string {
  const v = pairVerdictLabel(pair);
  if (v === "OK")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (v === "Warnings")
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
}
