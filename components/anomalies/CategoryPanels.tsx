"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { fileColor } from "@/components/shared/fileColors";
import { formatBytes } from "@/utils/harParser";
import {
  anomalyPathId,
  encodingDisplay,
  type AnomalyCategory,
  type AnomalyCategoryQuery,
  type AnomalyEntry,
  type AnomaliesReport,
  type CachePolicyAnomalyGroup,
  type EncodingAnomalyGroup,
  type GroupForCategory,
  type SizeAnomalyGroup,
  type StatusAnomalyGroup,
  categoryMeta,
} from "@/utils/anomalies";
import type { HarAnalysis } from "@/types/har";

function fileCategoryCount(
  file: AnomaliesReport["files"][number] | undefined,
  category: AnomalyCategory,
): number {
  if (!file) return 0;
  switch (category) {
    case "status":
      return file.status.pathGroupCount;
    case "size":
      return file.size.pathGroupCount;
    case "encoding":
      return file.encoding.pathGroupCount;
    case "cache-policy":
      return file.cachePolicy.pathGroupCount;
  }
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

export function CategoryTitle({
  category,
  fileCount,
  slice,
  scope,
}: {
  category: AnomalyCategory;
  fileCount: number;
  slice: { pathGroupCount: number; entryCount: number };
  scope: AnomalyCategoryQuery["file"];
}) {
  const meta = categoryMeta(category);
  const inScope = scope === "all" ? "all loaded files" : "1 file";
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap text-sm text-slate-600 dark:text-slate-500 mb-1">
        <Link
          href="/anomalies"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Anomalies
        </Link>
        <span aria-hidden>/</span>
        <span>{meta.shortTitle}</span>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        {meta.title}
      </h2>
      <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
        {meta.description} Across {inScope} ({fileCount} HAR file
        {fileCount !== 1 ? "s" : ""} · {slice.pathGroupCount.toLocaleString()}{" "}
        path group{slice.pathGroupCount === 1 ? "" : "s"} ·{" "}
        {slice.entryCount.toLocaleString()} entr
        {slice.entryCount === 1 ? "y" : "ies"}).
      </p>
    </div>
  );
}

export function CategoryFilterBar({
  analyses,
  report,
  category,
  query,
  setQuery,
}: {
  analyses: HarAnalysis[];
  report: AnomaliesReport;
  category: AnomalyCategory;
  query: AnomalyCategoryQuery;
  setQuery: (patch: Partial<AnomalyCategoryQuery>) => void;
}) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
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
          const n = fileCategoryCount(r, category);
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
    </div>
  );
}

function EntrySubTable({
  pathname,
  entries,
  showFile,
  analyses,
  extraColumns,
}: {
  pathname: string;
  entries: AnomalyEntry[];
  showFile: boolean;
  analyses: HarAnalysis[];
  extraColumns?: (row: AnomalyEntry) => React.ReactNode;
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
              {extraColumns && (
                <th className="text-left px-3 py-2 font-semibold">Detail</th>
              )}
              <th className="text-right px-3 py-2 font-semibold">Size</th>
              <th className="text-left px-3 py-2 font-semibold">Entry</th>
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
                  {extraColumns && (
                    <td className="px-3 py-2 text-xs">{extraColumns(row)}</td>
                  )}
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

function GroupTableShell<G extends { pathname: string; entries: AnomalyEntry[] }>({
  groups,
  query,
  setQuery,
  analyses,
  emptyMessage,
  children,
}: {
  groups: G[];
  query: AnomalyCategoryQuery;
  setQuery: (patch: Partial<AnomalyCategoryQuery>) => void;
  analyses: HarAnalysis[];
  emptyMessage: string;
  children: (group: G) => React.ReactNode;
}) {
  const pageSize = 25;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [query.file, groups.length]);

  useEffect(() => {
    if (!query.expand || groups.length === 0) return;
    const idx = groups.findIndex(
      (g) => anomalyPathId(g.pathname) === query.expand,
    );
    if (idx >= 0) setPage(Math.floor(idx / pageSize) + 1);
  }, [query.expand, groups]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 px-6 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageGroups = groups.slice((safePage - 1) * pageSize, safePage * pageSize);
  const showFile = query.file === "all";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Path groups
          <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-500">
            ({groups.length.toLocaleString()})
          </span>
        </h3>
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
          <tbody>
            {pageGroups.map((group) => {
              const pathId = anomalyPathId(group.pathname);
              const expanded = query.expand === pathId;
              return (
                <Fragment key={pathId}>
                  <tr className="border-t border-slate-200 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 w-8">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() =>
                          setQuery({ expand: expanded ? "" : pathId })
                        }
                        className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        {expanded ? "▼" : "▶"}
                      </button>
                    </td>
                    {children(group)}
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={99} className="p-0">
                        <EntrySubTable
                          pathname={group.pathname}
                          entries={group.entries}
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

export function StatusGroupTable({
  groups,
  query,
  setQuery,
  analyses,
}: {
  groups: StatusAnomalyGroup[];
  query: AnomalyCategoryQuery;
  setQuery: (patch: Partial<AnomalyCategoryQuery>) => void;
  analyses: HarAnalysis[];
}) {
  return (
    <GroupTableShell
      groups={groups}
      query={query}
      setQuery={setQuery}
      analyses={analyses}
      emptyMessage="No status anomalies on shared pathnames in scope."
    >
      {(group) => (
        <>
          <td className="px-3 py-2 font-mono text-xs">{group.pathname}</td>
          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
            {group.entries.length}
          </td>
          <td className="px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {group.distinctStatuses.map((code) => (
                <StatusBadge key={code} code={code} />
              ))}
            </div>
          </td>
          <td className="px-3 py-2">
            <button
              type="button"
              onClick={() =>
                setQuery({
                  expand:
                    query.expand === anomalyPathId(group.pathname)
                      ? ""
                      : anomalyPathId(group.pathname),
                })
              }
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {query.expand === anomalyPathId(group.pathname)
                ? "Hide entries"
                : "Show entries"}
            </button>
          </td>
        </>
      )}
    </GroupTableShell>
  );
}

export function SizeGroupTable({
  groups,
  query,
  setQuery,
  analyses,
}: {
  groups: SizeAnomalyGroup[];
  query: AnomalyCategoryQuery;
  setQuery: (patch: Partial<AnomalyCategoryQuery>) => void;
  analyses: HarAnalysis[];
}) {
  return (
    <GroupTableShell
      groups={groups}
      query={query}
      setQuery={setQuery}
      analyses={analyses}
      emptyMessage="No response size drift on shared pathnames in scope."
    >
      {(group) => {
        const g = group as SizeAnomalyGroup;
        return (
          <>
            <td className="px-3 py-2 font-mono text-xs">{g.pathname}</td>
            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
              {g.entries.length}
            </td>
            <td className="px-3 py-2 font-mono text-xs">
              {formatBytes(g.minSize)} → {formatBytes(g.maxSize)}
            </td>
            <td className="px-3 py-2 font-mono text-xs tabular-nums">
              {g.ratio.toFixed(2)}× · Δ {formatBytes(g.delta)}
            </td>
            <td className="px-3 py-2">
              <button
                type="button"
                onClick={() =>
                  setQuery({
                    expand:
                      query.expand === anomalyPathId(g.pathname)
                        ? ""
                        : anomalyPathId(g.pathname),
                  })
                }
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {query.expand === anomalyPathId(g.pathname)
                  ? "Hide entries"
                  : "Show entries"}
              </button>
            </td>
          </>
        );
      }}
    </GroupTableShell>
  );
}

export function EncodingGroupTable({
  groups,
  query,
  setQuery,
  analyses,
}: {
  groups: EncodingAnomalyGroup[];
  query: AnomalyCategoryQuery;
  setQuery: (patch: Partial<AnomalyCategoryQuery>) => void;
  analyses: HarAnalysis[];
}) {
  return (
    <GroupTableShell
      groups={groups}
      query={query}
      setQuery={setQuery}
      analyses={analyses}
      emptyMessage="No encoding anomalies in scope."
    >
      {(group) => {
        const g = group as EncodingAnomalyGroup;
        return (
          <>
            <td className="px-3 py-2">
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                  g.kind === "encoding-drift"
                    ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                {g.kind === "encoding-drift" ? "drift" : "large plain"}
              </span>
            </td>
            <td className="px-3 py-2 font-mono text-xs">{g.pathname}</td>
            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
              {g.entries.length}
            </td>
            <td className="px-3 py-2 font-mono text-xs">
              {g.distinctEncodings.join(", ")}
            </td>
            <td className="px-3 py-2">
              <button
                type="button"
                onClick={() =>
                  setQuery({
                    expand:
                      query.expand === anomalyPathId(g.pathname)
                        ? ""
                        : anomalyPathId(g.pathname),
                  })
                }
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {query.expand === anomalyPathId(g.pathname)
                  ? "Hide entries"
                  : "Show entries"}
              </button>
            </td>
          </>
        );
      }}
    </GroupTableShell>
  );
}

export function CachePolicyGroupTable({
  groups,
  query,
  setQuery,
  analyses,
}: {
  groups: CachePolicyAnomalyGroup[];
  query: AnomalyCategoryQuery;
  setQuery: (patch: Partial<AnomalyCategoryQuery>) => void;
  analyses: HarAnalysis[];
}) {
  return (
    <GroupTableShell
      groups={groups}
      query={query}
      setQuery={setQuery}
      analyses={analyses}
      emptyMessage="No Cache-Control or Vary inconsistencies on shared pathnames in scope."
    >
      {(group) => {
        const g = group as CachePolicyAnomalyGroup;
        const label =
          g.kind === "both"
            ? "CC + Vary"
            : g.kind === "vary"
              ? "Vary"
              : "Cache-Control";
        return (
          <>
            <td className="px-3 py-2">
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                {label}
              </span>
            </td>
            <td className="px-3 py-2 font-mono text-xs">{g.pathname}</td>
            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
              {g.entries.length}
            </td>
            <td className="px-3 py-2 text-xs max-w-[200px]">
              {g.distinctCacheControl.length > 0
                ? g.distinctCacheControl.join(" · ")
                : "—"}
            </td>
            <td className="px-3 py-2 text-xs max-w-[160px]">
              {g.distinctVary.length > 0 ? g.distinctVary.join(" · ") : "—"}
            </td>
            <td className="px-3 py-2">
              <button
                type="button"
                onClick={() =>
                  setQuery({
                    expand:
                      query.expand === anomalyPathId(g.pathname)
                        ? ""
                        : anomalyPathId(g.pathname),
                  })
                }
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {query.expand === anomalyPathId(g.pathname)
                  ? "Hide entries"
                  : "Show entries"}
              </button>
            </td>
          </>
        );
      }}
    </GroupTableShell>
  );
}

export function CategoryGroupTable<C extends AnomalyCategory>({
  category,
  groups,
  query,
  setQuery,
  analyses,
}: {
  category: C;
  groups: GroupForCategory<C>[];
  query: AnomalyCategoryQuery;
  setQuery: (patch: Partial<AnomalyCategoryQuery>) => void;
  analyses: HarAnalysis[];
}) {
  switch (category) {
    case "status":
      return (
        <StatusGroupTable
          groups={groups as StatusAnomalyGroup[]}
          query={query}
          setQuery={setQuery}
          analyses={analyses}
        />
      );
    case "size":
      return (
        <SizeGroupTable
          groups={groups as SizeAnomalyGroup[]}
          query={query}
          setQuery={setQuery}
          analyses={analyses}
        />
      );
    case "encoding":
      return (
        <EncodingGroupTable
          groups={groups as EncodingAnomalyGroup[]}
          query={query}
          setQuery={setQuery}
          analyses={analyses}
        />
      );
    case "cache-policy":
      return (
        <CachePolicyGroupTable
          groups={groups as CachePolicyAnomalyGroup[]}
          query={query}
          setQuery={setQuery}
          analyses={analyses}
        />
      );
  }
}
