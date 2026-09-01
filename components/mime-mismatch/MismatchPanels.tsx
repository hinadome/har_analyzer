"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { ContentTypeCell } from "@/components/shared/ContentTypeDisplay";
import { fileColor } from "@/components/shared/fileColors";
import { formatBytes } from "@/utils/harParser";
import {
  mimeMismatchEntryId,
  type MimeMismatchEntry,
  type MimeMismatchFileReport,
  type MimeMismatchReport,
} from "@/utils/mimeMismatch";
import type { HarAnalysis } from "@/types/har";
import type { FileScope, MimeMismatchQuery } from "./types";

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

export function PageTitle({
  fileCount,
  report,
  visibleCount,
  scope,
  showUnverified,
}: {
  fileCount: number;
  report: MimeMismatchReport;
  visibleCount: number;
  scope: FileScope;
  showUnverified: boolean;
}) {
  const inScope = scope === "all" ? "all loaded files" : "1 file";
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        MIME mismatch
      </h2>
      <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
        Content-Type vs URL file extension across {inScope} ({fileCount}{" "}
        HAR file{fileCount !== 1 ? "s" : ""} loaded ·{" "}
        {report.mismatchCount.toLocaleString()} mismatch
        {report.mismatchCount === 1 ? "" : "es"}
        {showUnverified
          ? ` · ${report.unverifiedCount.toLocaleString()} unverified extension${report.unverifiedCount === 1 ? "" : "s"} shown`
          : report.unverifiedCount > 0
            ? ` · ${report.unverifiedCount.toLocaleString()} unverified hidden`
            : ""}
        · {visibleCount.toLocaleString()} row{visibleCount === 1 ? "" : "s"}{" "}
        in table).
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
  report: MimeMismatchReport;
  query: MimeMismatchQuery;
  setQuery: (patch: Partial<MimeMismatchQuery>) => void;
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
          const n = r?.mismatchCount ?? 0;
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
          checked={query.showUnverified}
          onChange={(e) => setQuery({ showUnverified: e.target.checked })}
          className="accent-blue-600 rounded"
        />
        Show unverified extensions
        <span className="text-xs text-slate-500 dark:text-slate-500">
          (unknown extension — no expected MIME mapping in this tool)
        </span>
      </label>
    </div>
  );
}

export function KpiSummary({ files }: { files: MimeMismatchFileReport[] }) {
  const mismatch = files.reduce((n, f) => n + f.mismatchCount, 0);
  const unverified = files.reduce((n, f) => n + f.unverifiedCount, 0);
  const filesWithMismatch = files.filter((f) => f.mismatchCount > 0).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Mismatches", value: mismatch.toLocaleString() },
        { label: "Files with mismatches", value: filesWithMismatch.toLocaleString() },
        { label: "Unverified extensions", value: unverified.toLocaleString() },
        {
          label: "Scoped files",
          value: files.length.toLocaleString(),
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
    </div>
  );
}

interface TableRow {
  fileIndex: number;
  fileName: string;
  row: MimeMismatchEntry;
}

export function MismatchTable({
  files,
  analyses,
  query,
  setQuery,
}: {
  files: MimeMismatchFileReport[];
  analyses: HarAnalysis[];
  query: MimeMismatchQuery;
  setQuery: (patch: Partial<MimeMismatchQuery>) => void;
}) {
  const pageSize = 50;
  const [page, setPage] = useState(1);

  const rows = useMemo<TableRow[]>(() => {
    const out: TableRow[] = [];
    for (const f of files) {
      const fileName = analyses[f.fileIndex]?.fileName ?? `file-${f.fileIndex}`;
      for (const row of f.entries) {
        if (row.finding.kind === "mismatch") {
          out.push({ fileIndex: f.fileIndex, fileName, row });
        } else if (query.showUnverified && row.finding.kind === "unverified") {
          out.push({ fileIndex: f.fileIndex, fileName, row });
        }
      }
    }
    out.sort((a, b) =>
      a.row.entry.startedDateTime.localeCompare(b.row.entry.startedDateTime),
    );
    return out;
  }, [files, analyses, query.showUnverified]);

  useEffect(() => {
    setPage(1);
  }, [query.file, query.showUnverified, rows.length]);

  useEffect(() => {
    if (!query.expand || rows.length === 0) return;
    const idx = rows.findIndex((r) => mimeMismatchEntryId(r.row) === query.expand);
    if (idx >= 0) setPage(Math.floor(idx / pageSize) + 1);
  }, [query.expand, rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 px-6 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
        {query.showUnverified
          ? "No mismatches or unverified extensions in scope."
          : "No Content-Type vs extension mismatches in scope."}
        {!query.showUnverified && files.some((f) => f.unverifiedCount > 0) && (
          <p className="mt-2 text-xs text-slate-500">
            Enable <strong>Show unverified extensions</strong> to list entries
            whose extension is not in the MIME map.
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
            Entries
            <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-500">
              ({rows.length.toLocaleString()})
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            Response Content-Type compared to the URL pathname extension.
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
              <th className="text-left px-3 py-2 font-semibold">Kind</th>
              {showFile && (
                <th className="text-left px-3 py-2 font-semibold">File</th>
              )}
              <th className="text-left px-3 py-2 font-semibold">Method</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">URL</th>
              <th className="text-left px-3 py-2 font-semibold">Ext</th>
              <th className="text-left px-3 py-2 font-semibold">Content-Type</th>
              <th className="text-left px-3 py-2 font-semibold">Expected</th>
              <th className="text-right px-3 py-2 font-semibold">Size</th>
              <th className="text-left px-3 py-2 font-semibold">Detail</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ fileIndex, fileName, row }) => {
              const id = mimeMismatchEntryId(row);
              const isMismatch = row.finding.kind === "mismatch";
              return (
                <tr
                  key={id}
                  className="border-t border-slate-200 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                        isMismatch
                          ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {isMismatch ? "mismatch" : "unverified"}
                    </span>
                  </td>
                  {showFile && (
                    <td className="px-3 py-2 font-mono text-xs max-w-[120px] truncate" title={fileName}>
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
                  <td className="px-3 py-2 font-mono text-xs">.{row.finding.extension}</td>
                  <td className="px-3 py-2">
                    <ContentTypeCell entry={row.entry} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400 max-w-[160px]">
                    {row.finding.expectedTypes.length > 0
                      ? row.finding.expectedTypes.join(", ")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">
                    {formatBytes(row.entry.contentSize)}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/entry/${fileIndex}/${row.entryIndex}`}
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
