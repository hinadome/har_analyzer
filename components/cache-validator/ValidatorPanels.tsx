"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { fileColor } from "@/components/shared/fileColors";
import { formatBytes } from "@/utils/harParser";
import {
  cacheValidatorPathId,
  type CacheValidatorDriftKind,
  type CacheValidatorEntry,
  type CacheValidatorPathGroup,
  type CacheValidatorFileReport,
  type CacheValidatorPlainPathGroup,
  type CacheValidatorReport,
  type ParsedEtag,
  type ParsedLastModified,
} from "@/utils/cacheValidator";
import type { HarAnalysis } from "@/types/har";
import type { CacheValidatorQuery, FileScope } from "./types";

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
      title={title}
      onClick={onClick}
      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400"
      }`}
    >
      {children}
    </button>
  );
}

function DriftKindBadge({ kind }: { kind: CacheValidatorDriftKind }) {
  const label =
    kind === "both" ? "ETag + LM" : kind === "etag" ? "ETag" : "Last-Modified";
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
    >
      {label}
    </span>
  );
}

/** Weak ETags show a dashed W chip; strong tags use solid styling. */
export function EtagDisplay({
  etag,
  compact,
}: {
  etag: ParsedEtag | null;
  compact?: boolean;
}) {
  if (!etag) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-xs max-w-full ${
        compact ? "" : "flex-wrap"
      }`}
      title={etag.raw}
    >
      {etag.weak ? (
        <span
          className="shrink-0 px-1 py-0.5 rounded text-[10px] font-bold leading-none border border-dashed border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300"
          title="Weak ETag (W/)"
        >
          W
        </span>
      ) : (
        <span
          className="shrink-0 px-1 py-0.5 rounded text-[10px] font-bold leading-none border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          title="Strong ETag"
        >
          S
        </span>
      )}
      <span className="truncate">{etag.raw}</span>
    </span>
  );
}

function EtagList({ etags }: { etags: ParsedEtag[] }) {
  if (etags.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {etags.map((etag) => (
        <EtagDisplay key={etag.key} etag={etag} compact />
      ))}
    </div>
  );
}

function LastModifiedList({ values }: { values: ParsedLastModified[] }) {
  if (values.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 font-mono text-xs">
      {values.map((lm) => (
        <span key={lm.key} title={lm.raw}>{lm.raw}</span>
      ))}
    </div>
  );
}

export function PageTitle({
  fileCount,
  report,
  visibleGroupCount,
  scope,
  showNoValidator,
}: {
  fileCount: number;
  report: CacheValidatorReport;
  visibleGroupCount: number;
  scope: FileScope;
  showNoValidator: boolean;
}) {
  const inScope = scope === "all" ? "all loaded files" : "1 file";
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Cache validator
      </h2>
      <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
        Same pathname (query ignored) with different ETag or Last-Modified across{" "}
        {inScope} ({fileCount} HAR file{fileCount !== 1 ? "s" : ""} loaded ·{" "}
        {report.pathConflictCount.toLocaleString()} path
        {report.pathConflictCount === 1 ? "" : "s"} with drift ·{" "}
        {report.entryCount.toLocaleString()} entr
        {report.entryCount === 1 ? "y" : "ies"} involved
        {showNoValidator
          ? ` · ${report.noValidatorPathCount.toLocaleString()} no-validator path${report.noValidatorPathCount === 1 ? "" : "s"} shown`
          : report.noValidatorPathCount > 0
            ? ` · ${report.noValidatorPathCount.toLocaleString()} no-validator hidden`
            : ""}
        · {visibleGroupCount.toLocaleString()} row
        {visibleGroupCount === 1 ? "" : "s"} in table).
      </p>
    </div>
  );
}

export function FilterBar({
  analyses,
  report,
  query,
  setQuery,
}: {
  analyses: HarAnalysis[];
  report: CacheValidatorReport;
  query: CacheValidatorQuery;
  setQuery: (patch: Partial<CacheValidatorQuery>) => void;
}) {
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
          const n = r?.pathConflictCount ?? 0;
          return (
            <ScopeChip
              key={i}
              active={query.file === i}
              onClick={() => setQuery({ file: i })}
              title={a.fileName}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${c.dot}`} />
              <span className="truncate max-w-[140px]">{a.fileName}</span>
              {n > 0 && (
                <span className="ml-1 text-amber-700 dark:text-amber-400">
                  ({n})
                </span>
              )}
            </ScopeChip>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={query.showNoValidator}
          onChange={(e) => setQuery({ showNoValidator: e.target.checked })}
          className="accent-blue-600 rounded"
        />
        Show paths with no cache validators
        <span className="text-xs text-slate-500 dark:text-slate-500">
          (≥2 entries on the same path, but no ETag or Last-Modified on any)
        </span>
      </label>
      <p className="text-xs text-slate-500 dark:text-slate-500">
        Weak ETags (<span className="font-mono">W/</span>) are compared separately from
        strong tags — same value with different weak/strong is drift.{" "}
        <span className="inline-flex items-center gap-1">
          <span className="px-1 py-0.5 rounded text-[10px] font-bold border border-dashed border-violet-400 text-violet-700 dark:text-violet-300">
            W
          </span>
          weak
        </span>
        ·
        <span className="inline-flex items-center gap-1 ml-1">
          <span className="px-1 py-0.5 rounded text-[10px] font-bold border border-slate-300 text-slate-600 dark:text-slate-400">
            S
          </span>
          strong
        </span>
      </p>
    </div>
  );
}

export function KpiSummary({
  groups,
  noValidatorPathCount,
}: {
  groups: CacheValidatorPathGroup[];
  noValidatorPathCount: number;
}) {
  const entryCount = groups.reduce((n, g) => n + g.entries.length, 0);
  const etagOnly = groups.filter((g) => g.kind === "etag").length;
  const lmOnly = groups.filter((g) => g.kind === "last-modified").length;
  const both = groups.filter((g) => g.kind === "both").length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Paths with drift", value: groups.length.toLocaleString() },
        { label: "Entries involved", value: entryCount.toLocaleString() },
        {
          label: "ETag drift",
          value: (etagOnly + both).toLocaleString(),
        },
        {
          label: "Last-Modified drift",
          value: (lmOnly + both).toLocaleString(),
        },
      ].map(({ label, value }) => (
        <div
          key={label}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-4 py-3"
        >
          <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-500">
            {label}
          </p>
          <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {value}
          </p>
        </div>
      ))}
      {noValidatorPathCount > 0 && (
        <div
          className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/30 px-4 py-3 col-span-2 sm:col-span-4"
        >
          <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-500">
            No-validator paths (toggle to list)
          </p>
          <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {noValidatorPathCount.toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

function EntrySubTable({
  pathname,
  entries,
  showFile,
  analyses,
}: {
  pathname: string;
  entries: CacheValidatorEntry[];
  showFile: boolean;
  analyses: HarAnalysis[];
}) {
  return (
    <div className="bg-slate-50/80 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700">
      <div className="px-4 py-2 flex items-center justify-between gap-2 flex-wrap border-b border-slate-200 dark:border-slate-800">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
          {entries.length.toLocaleString()} entr
          {entries.length === 1 ? "y" : "ies"} on{" "}
          <span className="font-mono">{pathname}</span>
        </p>
        <Link
          href={`/entry-diff?url=${encodeURIComponent(pathname)}`}
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Open in entry diff →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-100/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              {showFile && (
                <th className="text-left px-3 py-2 font-semibold">File</th>
              )}
              <th className="text-left px-3 py-2 font-semibold">Method</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">URL</th>
              <th className="text-left px-3 py-2 font-semibold">ETag</th>
              <th className="text-left px-3 py-2 font-semibold">Last-Modified</th>
              <th className="text-right px-3 py-2 font-semibold">Size</th>
              <th className="text-left px-3 py-2 font-semibold">Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row) => {
              const fileName =
                analyses[row.fileIndex]?.fileName ?? `file-${row.fileIndex}`;
              return (
                <tr
                  key={`${row.fileIndex}:${row.entryIndex}`}
                  className="border-t border-slate-200/80 dark:border-slate-800/60"
                >
                  {showFile && (
                    <td
                      className="px-3 py-2 font-mono text-xs max-w-[120px] truncate"
                      title={fileName}
                    >
                      {fileName}
                    </td>
                  )}
                  <td className="px-3 py-2 font-mono text-xs">{row.entry.method}</td>
                  <td className="px-3 py-2">
                    <StatusBadge code={row.entry.status} />
                  </td>
                  <td className="px-3 py-2 max-w-[220px]">
                    <Link
                      href={`/compare?url=${encodeURIComponent(row.entry.url)}`}
                      className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline truncate block"
                      title={row.entry.url}
                    >
                      {row.entry.url}
                    </Link>
                  </td>
                  <td className="px-3 py-2 max-w-[180px]">
                    <EtagDisplay etag={row.etag} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs max-w-[160px] truncate">
                    {row.lastModified?.raw ?? (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">
                    {formatBytes(row.entry.contentSize)}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/entry/${row.fileIndex}/${row.entryIndex}`}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Entry →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PathGroupTable({
  driftGroups,
  noValidatorGroups,
  analyses,
  query,
  setQuery,
  noValidatorPathCount,
}: {
  driftGroups: CacheValidatorPathGroup[];
  noValidatorGroups: CacheValidatorPlainPathGroup[];
  analyses: HarAnalysis[];
  query: CacheValidatorQuery;
  setQuery: (patch: Partial<CacheValidatorQuery>) => void;
  noValidatorPathCount: number;
}) {
  const pageSize = 25;
  const [page, setPage] = useState(1);

  type TableRow =
    | { mode: "drift"; group: CacheValidatorPathGroup }
    | { mode: "no-validator"; group: CacheValidatorPlainPathGroup };

  const rows = useMemo<TableRow[]>(() => {
    const out: TableRow[] = driftGroups.map((group) => ({
      mode: "drift",
      group,
    }));
    if (query.showNoValidator) {
      for (const group of noValidatorGroups) {
        out.push({ mode: "no-validator", group });
      }
    }
    return out;
  }, [driftGroups, noValidatorGroups, query.showNoValidator]);

  useEffect(() => {
    setPage(1);
  }, [query.file, query.showNoValidator, rows.length]);

  useEffect(() => {
    if (!query.expand || rows.length === 0) return;
    const idx = rows.findIndex(
      (r) => cacheValidatorPathId(r.group.pathname) === query.expand,
    );
    if (idx >= 0) setPage(Math.floor(idx / pageSize) + 1);
  }, [query.expand, rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 px-6 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
        No ETag or Last-Modified drift on shared pathnames in scope.
        {!query.showNoValidator && noValidatorPathCount > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Enable <strong>Show paths with no cache validators</strong> to list{" "}
            {noValidatorPathCount.toLocaleString()} path
            {noValidatorPathCount === 1 ? "" : "s"} with multiple entries but no
            validators.
          </p>
        )}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const showFile = query.file === "all";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Path groups
            <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-500">
              ({rows.length.toLocaleString()})
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            Pathname only — query strings ignored. Expand a row to see every entry.
          </p>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-semibold w-8" />
              <th className="text-left px-3 py-2 font-semibold">Drift</th>
              <th className="text-left px-3 py-2 font-semibold">Pathname</th>
              <th className="text-right px-3 py-2 font-semibold">Entries</th>
              <th className="text-left px-3 py-2 font-semibold">ETag values</th>
              <th className="text-left px-3 py-2 font-semibold">Last-Modified</th>
              <th className="text-left px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const pathname = row.group.pathname;
              const pathId = cacheValidatorPathId(pathname);
              const expanded = query.expand === pathId;
              const entryCount = row.group.entries.length;
              return (
                <Fragment key={pathId}>
                  <tr
                    className="border-t border-slate-200 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={expanded ? "Collapse entries" : "Expand entries"}
                        onClick={() =>
                          setQuery({
                            expand: expanded ? "" : pathId,
                          })
                        }
                        className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        {expanded ? "▼" : "▶"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {row.mode === "drift" ? (
                        <DriftKindBadge kind={row.group.kind} />
                      ) : (
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        >
                          no validators
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{pathname}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      {entryCount}
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      {row.mode === "drift" ? (
                        <EtagList etags={row.group.distinctEtags} />
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      {row.mode === "drift" ? (
                        <LastModifiedList values={row.group.distinctLastModified} />
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setQuery({
                              expand: expanded ? "" : pathId,
                            })
                          }
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline text-left"
                        >
                          {expanded ? "Hide entries" : "Show entries"}
                        </button>
                        <Link
                          href={`/entry-diff?url=${encodeURIComponent(pathname)}`}
                          className="text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                          Entry diff →
                        </Link>
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <EntrySubTable
                          pathname={pathname}
                          entries={row.group.entries}
                          showFile={showFile}
                          analyses={analyses}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
