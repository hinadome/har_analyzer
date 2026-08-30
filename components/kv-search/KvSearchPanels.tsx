"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { fileColor } from "@/components/shared/fileColors";
import {
  KV_LOCATIONS,
  kvEntryId,
  type KvLocation,
  type KvSearchHit,
  type KvSearchMode,
  type KvSearchOutcome,
  type MatchRange,
} from "@/utils/kvSearch";
import type { EntryRecord, HarAnalysis } from "@/types/har";
import type { FileScope, PageQuery } from "./types";


const LOCATION_STYLE: Record<
  KvLocation,
  { label: string; chip: string; dot: string }
> = {
  "request-header": {
    label: "Req Header",
    chip: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
    dot: "bg-blue-500",
  },
  "response-header": {
    label: "Res Header",
    chip: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50",
    dot: "bg-indigo-500",
  },
  "request-cookie": {
    label: "Req Cookie",
    chip: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
    dot: "bg-amber-500",
  },
  "response-cookie": {
    label: "Res Cookie",
    chip: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900/50",
    dot: "bg-pink-500",
  },
};

export function PageTitle({
  fileCount,
  scope,
}: {
  fileCount: number;
  scope: FileScope;
}) {
  const inScope = scope === "all" ? "all loaded files" : "1 file";
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Header &amp; Cookie Search
      </h2>
      <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
        Search by name and/or value across request and response headers and
        cookies in {inScope} ({fileCount.toLocaleString()} HAR file
        {fileCount !== 1 ? "s" : ""} loaded).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

function ScopeChip({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
        active
          ? "bg-blue-600 text-white border-blue-600 dark:border-blue-500"
          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function SearchBar({
  analyses,
  query,
  setQuery,
  nameInput,
  valueInput,
  urlInput,
  onNameChange,
  onValueChange,
  onUrlChange,
  errors,
}: {
  analyses: HarAnalysis[];
  query: PageQuery;
  setQuery: (patch: Partial<PageQuery>) => void;
  nameInput: string;
  valueInput: string;
  urlInput: string;
  onNameChange: (v: string) => void;
  onValueChange: (v: string) => void;
  onUrlChange: (v: string) => void;
  errors: { side: "name" | "value"; message: string }[];
}) {
  const nameError = errors.find((e) => e.side === "name");
  const valueError = errors.find((e) => e.side === "value");

  const toggleScope = (loc: KvLocation) => {
    const next = new Set(query.scope);
    if (next.has(loc)) next.delete(loc);
    else next.add(loc);
    setQuery({ scope: next });
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
      {/* Name + Value inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="kv-name"
            className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1.5"
          >
            Name
          </label>
          <input
            id="kv-name"
            type="text"
            value={nameInput}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Authorization, sessionid, ^x-"
            className={`w-full bg-white dark:bg-slate-900 border rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 ${
              nameError
                ? "border-red-500 dark:border-red-500"
                : "border-slate-200 dark:border-slate-700"
            }`}
          />
          {nameError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Invalid regex: {nameError.message}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="kv-value"
            className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1.5"
          >
            Value
          </label>
          <input
            id="kv-value"
            type="text"
            value={valueInput}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="e.g. Bearer, application/json"
            className={`w-full bg-white dark:bg-slate-900 border rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 ${
              valueError
                ? "border-red-500 dark:border-red-500"
                : "border-slate-200 dark:border-slate-700"
            }`}
          />
          {valueError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Invalid regex: {valueError.message}
            </p>
          )}
        </div>
      </div>

      {/* URL filter (entry pre-filter — always contains, case-insensitive) */}
      <div>
        <label
          htmlFor="kv-url"
          className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1.5"
        >
          URL contains{" "}
          <span className="normal-case text-slate-500 dark:text-slate-600">
            (optional, narrows entries before name/value)
          </span>
        </label>
        <input
          id="kv-url"
          type="text"
          value={urlInput}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="e.g. /api/v1/users, cdn.example.com"
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Scope chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mr-1">
          Scope:
        </span>
        {KV_LOCATIONS.map((loc) => {
          const style = LOCATION_STYLE[loc];
          const active = query.scope.has(loc);
          return (
            <ScopeChip
              key={loc}
              active={active}
              onClick={() => toggleScope(loc)}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white/80" : style.dot}`}
              />
              {style.label}
            </ScopeChip>
          );
        })}
      </div>

      {/* Mode + case + file row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <label
            htmlFor="kv-mode"
            className="uppercase tracking-wider text-slate-600 dark:text-slate-500"
          >
            Mode:
          </label>
          <select
            id="kv-mode"
            value={query.mode}
            onChange={(e) => setQuery({ mode: e.target.value as KvSearchMode })}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="contains">Contains</option>
            <option value="exact">Exact</option>
            <option value="regex">Regex</option>
          </select>
        </div>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={query.caseSensitive}
            onChange={(e) => setQuery({ caseSensitive: e.target.checked })}
            className="accent-blue-600"
          />
          Case sensitive
        </label>
        {analyses.length > 1 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="kv-file"
              className="uppercase tracking-wider text-slate-600 dark:text-slate-500"
            >
              File:
            </label>
            <select
              id="kv-file"
              value={query.file === "all" ? "all" : String(query.file)}
              onChange={(e) => {
                const v = e.target.value;
                setQuery({ file: v === "all" ? "all" : Number(v) });
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 max-w-[240px]"
            >
              <option value="all">All files ({analyses.length})</option>
              {analyses.map((a, i) => (
                <option key={i} value={i}>
                  {a.fileName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary line
// ---------------------------------------------------------------------------

export function SummaryLine({
  outcome,
  analyses,
  hasInput,
  query,
}: {
  outcome: KvSearchOutcome;
  analyses: HarAnalysis[];
  hasInput: boolean;
  query: PageQuery;
}) {
  if (!hasInput) return null;
  if (outcome.errors.length > 0) return null;

  const { totalHits, totalMatches, filesTouched, perLocation } =
    outcome.summary;
  const scopeLabel =
    query.file === "all"
      ? `across ${filesTouched} of ${analyses.length} file${analyses.length === 1 ? "" : "s"}`
      : `in ${analyses[query.file]?.fileName ?? "1 file"}`;
  const urlLabel =
    query.url !== "" ? (
      <>
        {" "}
        · URL contains{" "}
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
          {query.url}
        </span>
      </>
    ) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
      <span>
        <span className="font-semibold">{totalHits.toLocaleString()}</span> entr
        {totalHits === 1 ? "y" : "ies"} matched ·{" "}
        <span className="font-semibold">{totalMatches.toLocaleString()}</span>{" "}
        kv match{totalMatches === 1 ? "" : "es"} {scopeLabel}
        {urlLabel}
      </span>
      {totalMatches > 0 && (
        <span className="text-xs text-slate-600 dark:text-slate-500 flex items-center gap-2">
          {KV_LOCATIONS.filter((loc) => perLocation[loc] > 0).map((loc) => {
            const s = LOCATION_STYLE[loc];
            return (
              <span key={loc} className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {perLocation[loc]} {s.label.toLowerCase()}
              </span>
            );
          })}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

export function ResultsTable({
  hits,
  analyses,
  query,
  setQuery,
  hasInput,
}: {
  hits: KvSearchHit[];
  analyses: HarAnalysis[];
  query: PageQuery;
  setQuery: (patch: Partial<PageQuery>) => void;
  hasInput: boolean;
}) {
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const expandedRef = useRef<HTMLTableRowElement | null>(null);
  const indexedAnalyses = useMemoIndexed(analyses);

  // Reset to page 1 when the result set identity changes (new search).
  const hitsKey = hits.length;
  useEffect(() => {
    setPage(1);
  }, [hitsKey, query.name, query.value, query.url, query.mode, query.file, query.caseSensitive]);

  // Deep-link expand: jump to the page that contains the expanded row.
  useEffect(() => {
    if (!query.expand || hits.length === 0) return;
    const idx = hits.findIndex((hit) => {
      const indexInFile = indexedAnalyses.get(hit.entry) ?? 0;
      return kvEntryId(hit.entry, indexInFile) === query.expand;
    });
    if (idx >= 0) {
      setPage(Math.floor(idx / pageSize) + 1);
    }
  }, [query.expand, hits, indexedAnalyses]);

  useEffect(() => {
    if (query.expand && expandedRef.current) {
      expandedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasInput) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 px-6 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
        Enter a name or value to search across request and response headers and
        cookies.
      </div>
    );
  }

  if (hits.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-6 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
        <p>No matches.</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
          Try a different name/value, clear the URL filter, broaden the scope
          chips, or switch the match mode.
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(hits.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = hits.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-900/60">
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-6">
                <span className="sr-only">Expand</span>
              </th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                File
              </th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Method
              </th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                URL
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Matches
              </th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Timestamp (UTC)
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((hit) => {
              const indexInFile = indexedAnalyses.get(hit.entry) ?? 0;
              const id = kvEntryId(hit.entry, indexInFile);
              const expanded = query.expand === id;
              return (
                <ResultRow
                  key={id}
                  hit={hit}
                  indexInFile={indexInFile}
                  expanded={expanded}
                  analyses={analyses}
                  onToggle={() => setQuery({ expand: expanded ? "" : id })}
                  rowRef={expanded ? expandedRef : undefined}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>
            Showing {((safePage - 1) * pageSize + 1).toLocaleString()}–
            {Math.min(safePage * pageSize, hits.length).toLocaleString()} of{" "}
            {hits.length.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-3 py-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Build a stable entry → indexInFile map so kvEntryId is consistent. */
function useMemoIndexed(analyses: HarAnalysis[]) {
  return useMemo(() => {
    const map = new Map<EntryRecord, number>();
    for (const a of analyses) {
      a.entries.forEach((e, i) => map.set(e, i));
    }
    return map;
  }, [analyses]);
}

// ---------------------------------------------------------------------------
// Result row + expanded panel
// ---------------------------------------------------------------------------

function ResultRow({
  hit,
  indexInFile,
  expanded,
  analyses,
  onToggle,
  rowRef,
}: {
  hit: KvSearchHit;
  indexInFile: number;
  expanded: boolean;
  analyses: HarAnalysis[];
  onToggle: () => void;
  rowRef?: React.RefObject<HTMLTableRowElement | null>;
}) {
  const entry = hit.entry;
  const fileMeta = analyses[entry.harFileIndex];
  const color = fileColor(entry.harFileIndex);
  let pathName = entry.url;
  try {
    pathName = new URL(entry.url).pathname || "/";
  } catch {
    // Leave raw URL fallback.
  }

  return (
    <Fragment>
      <tr
        ref={rowRef}
        className={`border-t border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
          expanded ? "bg-slate-50 dark:bg-slate-800/40" : ""
        }`}
        onClick={onToggle}
      >
        <td className="py-2 px-3 align-top">
          <svg
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </td>
        <td className="py-2 px-3 align-top">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
            <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
            <span className="truncate max-w-[180px]" title={fileMeta?.fileName}>
              {fileMeta?.fileName ?? "?"}
            </span>
          </span>
        </td>
        <td className="py-2 px-3 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
          {entry.method}
        </td>
        <td className="py-2 px-3 align-top">
          <StatusBadge code={entry.status} />
        </td>
        <td
          className="py-2 px-3 align-top font-mono text-xs truncate max-w-[420px]"
          title={entry.url}
        >
          <Link
            href={`/compare?url=${encodeURIComponent(entry.url)}`}
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {pathName}
          </Link>
        </td>
        <td className="py-2 px-3 align-top text-right text-xs text-slate-700 dark:text-slate-300 tabular-nums">
          {hit.matches.length}
        </td>
        <td className="py-2 px-3 align-top text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {entry.startedDateTime
            ? new Date(entry.startedDateTime).toLocaleString("en-US", {
                timeZone: "UTC",
              }) + " UTC"
            : "—"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
          <td colSpan={7} className="px-3 py-3">
            <ExpandedPanel hit={hit} indexInFile={indexInFile} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function ExpandedPanel({
  hit,
  indexInFile,
}: {
  hit: KvSearchHit;
  indexInFile: number;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-600 dark:text-slate-500 break-all">
        <span className="uppercase tracking-wider mr-2">URL</span>
        <Link
          href={`/entry/${hit.entry.harFileIndex}/${indexInFile}`}
          className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
        >
          {hit.entry.url}
        </Link>
      </div>
      <ul className="space-y-1.5">
        {hit.matches.map((m, i) => {
          const style = LOCATION_STYLE[m.location];
          return (
            <li
              key={i}
              className="flex flex-wrap items-start gap-2 text-xs bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1.5"
            >
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${style.chip} font-medium`}
              >
                <span className={`w-1 h-1 rounded-full ${style.dot}`} />
                {style.label}
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300 break-all">
                <Highlight text={m.name} ranges={m.nameRanges} />
              </span>
              <span className="text-slate-400 dark:text-slate-600">:</span>
              <span className="font-mono text-slate-600 dark:text-slate-400 break-all flex-1 min-w-0">
                <Highlight text={m.value} ranges={m.valueRanges} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Highlight({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  // Ranges are non-overlapping and sorted by `searchEntries`.
  const out: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) out.push(text.slice(cursor, r.start));
    out.push(
      <mark
        key={i}
        className="bg-yellow-200 dark:bg-yellow-500/40 text-slate-900 dark:text-yellow-50 rounded px-0.5"
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}
