'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import StatusBadge from '@/components/StatusBadge';
import { useHarStore } from '@/hooks/useHarStore';
import { formatBytes } from '@/utils/harParser';
import {
  isBinaryEntry,
  prettifyIfJson,
  truncateBody,
  computeDiff,
  entryId,
  stripQuery,
  buildUrlGroups,
  TRUNCATION_LIMIT,
} from '@/utils/contentDiff';
import type { EntryRecord } from '@/types/har';
import type { UrlGroup } from '@/utils/contentDiff';
import UnifiedDiffView from '@/components/UnifiedDiffView';
import SideBySideDiffView from '@/components/SideBySideDiffView';
import type { EntryRecord } from '@/types/har';

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

interface EntryRowProps {
  entry: EntryRecord;
  isBaseline: boolean;
  isCompare: boolean;
  onSelectBaseline: () => void;
  onSelectCompare: () => void;
}

function EntryRow({ entry, isBaseline, isCompare, onSelectBaseline, onSelectCompare }: EntryRowProps) {
  const binary = isBinaryEntry(entry);
  const utc = entry.startedDateTime
    ? new Date(entry.startedDateTime).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC'
    : '—';

  return (
    <tr className="border-t border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      {/* Baseline radio */}
      <td className="py-3 px-4 text-center">
        <input
          type="radio"
          name="baseline"
          checked={isBaseline}
          onChange={onSelectBaseline}
          className="accent-blue-600"
          aria-label={`Set ${entry.harFileName} as baseline`}
        />
      </td>
      {/* Compare radio */}
      <td className="py-3 px-4 text-center">
        <input
          type="radio"
          name="compare"
          checked={isCompare}
          onChange={onSelectCompare}
          className="accent-green-600"
          aria-label={`Set ${entry.harFileName} as compare`}
        />
      </td>
      {/* HAR file name */}
      <td className="py-3 px-4 text-sm font-mono text-slate-700 dark:text-slate-300 max-w-[180px]">
        <span className="truncate block max-w-[180px]" title={entry.harFileName}>
          {entry.harFileName}
        </span>
      </td>
      {/* Full URL */}
      <td className="py-3 px-4 text-xs font-mono text-blue-600 dark:text-blue-400 max-w-[260px]">
        <Link
          href={`/compare?url=${encodeURIComponent(entry.url)}`}
          className="truncate block max-w-[260px] hover:underline"
          title={entry.url}
        >
          {entry.url}
        </Link>
      </td>
      {/* Status */}
      <td className="py-3 px-4 text-sm">
        <StatusBadge code={entry.status} />
      </td>
      {/* Content type */}
      <td className="py-3 px-4 text-sm font-mono text-purple-600 dark:text-purple-400 text-xs">
        {entry.contentType || '—'}
      </td>
      {/* Size */}
      <td className="py-3 px-4 text-sm font-mono text-slate-700 dark:text-slate-300 text-right text-xs">
        {formatBytes(entry.contentSize)}
      </td>
      {/* Timestamp */}
      <td className="py-3 px-4 text-sm font-mono text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
        {utc}
      </td>
      {/* Binary badge */}
      <td className="py-3 px-4 text-sm">
        {binary && (
          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            binary
          </span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Binary fallback
// ---------------------------------------------------------------------------

function BinaryFallback({ baseline, compare }: { baseline: EntryRecord; compare: EntryRecord }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-6 space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Body diffing is unavailable for binary or uncaptured content. Size comparison:
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-5 py-4">
          <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-1">Baseline</p>
          <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
            {formatBytes(baseline.contentSize)}
          </p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-500 truncate mt-1" title={baseline.harFileName}>
            {baseline.harFileName}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-5 py-4">
          <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-1">Compare</p>
          <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
            {formatBytes(compare.contentSize)}
          </p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-500 truncate mt-1" title={compare.harFileName}>
            {compare.harFileName}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Truncation notice
// ---------------------------------------------------------------------------

interface TruncationNoticeProps {
  fullLength: number;
  showFull: boolean;
  onToggle: () => void;
  label: string;
}

function TruncationNotice({ fullLength, showFull, onToggle, label }: TruncationNoticeProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs">
      <span className="text-amber-700 dark:text-amber-400">
        <strong>{label}</strong> truncated at {TRUNCATION_LIMIT.toLocaleString()} of {fullLength.toLocaleString()} characters
      </span>
      <button
        onClick={onToggle}
        className="ml-4 text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 underline underline-offset-2 shrink-0"
      >
        {showFull ? 'Show less' : 'Show full content'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content component (uses useSearchParams — must be inside Suspense)
// ---------------------------------------------------------------------------

function ContentDiffPageContent() {
  const searchParams = useSearchParams();
  const urlParam = searchParams.get('url') ?? '';

  const { analyses, isLoading } = useHarStore();

  // URL search state
  const [urlInput, setUrlInput] = useState(urlParam);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(urlParam || null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [ignoreQuery, setIgnoreQuery] = useState(false);

  // Entry selection
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);

  // Diff mode
  const [diffMode, setDiffMode] = useState<'unified' | 'side-by-side'>('unified');

  // Truncation toggles
  const [showFullBaseline, setShowFullBaseline] = useState(false);
  const [showFullCompare, setShowFullCompare] = useState(false);

  // Pre-populate from URL param on mount is handled via useState initializer above

  // All unique URLs across all entries
  const allUrls = useMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const a of analyses) {
      for (const e of a.entries) {
        seen.add(e.url);
      }
    }
    return Array.from(seen).sort();
  }, [analyses]);

  // Grouped URL candidates for the dropdown
  const urlGroups = useMemo<UrlGroup[]>(() => {
    if (!urlInput) return [];
    const q = urlInput.toLowerCase();
    const matching = allUrls.filter((u) => u.toLowerCase().includes(q));
    return buildUrlGroups(matching, ignoreQuery);
  }, [allUrls, urlInput, ignoreQuery]);

  // Entries for the selected URL (respects ignoreQuery toggle)
  const urlEntries = useMemo<EntryRecord[]>(() => {
    if (!selectedUrl) return [];
    const allEntries = analyses.flatMap((a) => a.entries);
    if (ignoreQuery) {
      const base = stripQuery(selectedUrl);
      return allEntries.filter((e) => stripQuery(e.url) === base);
    }
    return allEntries.filter((e) => e.url === selectedUrl);
  }, [analyses, selectedUrl, ignoreQuery]);

  // Resolve selected entry objects
  const baselineEntry = useMemo<EntryRecord | null>(
    () => (baselineId ? urlEntries.find((e) => entryId(e) === baselineId) ?? null : null),
    [urlEntries, baselineId]
  );
  const compareEntry = useMemo<EntryRecord | null>(
    () => (compareId ? urlEntries.find((e) => entryId(e) === compareId) ?? null : null),
    [urlEntries, compareId]
  );

  // Diff computation
  const diffData = useMemo(() => {
    if (!baselineEntry || !compareEntry) return null;
    if (baselineId === compareId) return null;
    if (isBinaryEntry(baselineEntry) || isBinaryEntry(compareEntry)) return null;

    const baseRaw = baselineEntry.responseContent ?? '';
    const cmpRaw = compareEntry.responseContent ?? '';

    const baseTrunc = truncateBody(baseRaw, showFullBaseline);
    const cmpTrunc = truncateBody(cmpRaw, showFullCompare);

    const basePrettified = prettifyIfJson(baseTrunc.text, baselineEntry.contentType);
    const cmpPrettified = prettifyIfJson(cmpTrunc.text, compareEntry.contentType);

    const prettified = basePrettified.wasPrettified || cmpPrettified.wasPrettified;
    const result = computeDiff(basePrettified.text, cmpPrettified.text, prettified);

    return {
      result,
      baseTruncated: baseTrunc.wasTruncated,
      baseFullLength: baseTrunc.fullLength,
      cmpTruncated: cmpTrunc.wasTruncated,
      cmpFullLength: cmpTrunc.fullLength,
    };
  }, [baselineEntry, compareEntry, baselineId, compareId, showFullBaseline, showFullCompare]);

  // Handlers
  const handleUrlInputChange = (v: string) => {
    setUrlInput(v);
    setShowDropdown(true);
    if (!v) {
      setSelectedUrl(null);
      setBaselineId(null);
      setCompareId(null);
    }
  };

  const handleUrlSelect = (url: string) => {
    setUrlInput(url);
    setSelectedUrl(url);
    setShowDropdown(false);
    setBaselineId(null);
    setCompareId(null);
    setShowFullBaseline(false);
    setShowFullCompare(false);
  };

  const handleClear = () => {
    setUrlInput('');
    setSelectedUrl(null);
    setShowDropdown(false);
    setBaselineId(null);
    setCompareId(null);
    setShowFullBaseline(false);
    setShowFullCompare(false);
  };

  // Validation
  const sameEntrySelected = baselineId !== null && baselineId === compareId;
  const bothSelected = baselineEntry !== null && compareEntry !== null && !sameEntrySelected;
  const eitherBinary = bothSelected && (isBinaryEntry(baselineEntry!) || isBinaryEntry(compareEntry!));

  // URL not found state (urlParam provided but not in store)
  const urlParamNotFound =
    urlParam && !isLoading && analyses.length > 0 &&
    !allUrls.some((u) => (ignoreQuery ? stripQuery(u) === stripQuery(urlParam) : u === urlParam));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 transition-colors flex items-center gap-1.5 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>
          <div className="h-5 w-px bg-slate-300 dark:bg-slate-700" />
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h1 className="text-xl font-bold tracking-tight">HAR Analyzer</h1>
          </div>
          <span className="text-slate-400 dark:text-slate-600 text-sm">/ Content Diff</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* No HAR data state */}
        {!analyses.length ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <p className="text-slate-600 dark:text-slate-400 text-lg">No HAR data loaded.</p>
            <Link href="/" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-300 underline">
              ← Upload HAR files to get started
            </Link>
          </div>
        ) : (
          <>
            {/* URL Search */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Search URL
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ignoreQuery}
                    onChange={(e) => {
                      setIgnoreQuery(e.target.checked);
                      setBaselineId(null);
                      setCompareId(null);
                    }}
                    className="accent-blue-600"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Ignore query string</span>
                </label>
              </div>
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => handleUrlInputChange(e.target.value)}
                    onFocus={() => urlInput && setShowDropdown(true)}
                    placeholder="Type or paste a URL..."
                    className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 dark:focus:border-blue-500 transition-colors"
                  />
                  {urlInput && (
                    <button
                      onClick={handleClear}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Grouped dropdown */}
                {showDropdown && urlInput && (
                  <div className="absolute z-20 w-full mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-72 overflow-y-auto">
                    {urlGroups.length > 0 ? (
                      urlGroups.map((group) => (
                        <div key={group.basePath}>
                          {/* Group header — base path */}
                          <button
                            onClick={() => handleUrlSelect(group.basePath)}
                            className="w-full text-left px-4 py-2 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors border-b border-slate-100 dark:border-slate-800 truncate block"
                            title={group.basePath}
                          >
                            {group.basePath}
                          </button>
                          {/* Full URLs under this base path (only shown when ignoreQuery is on and there are variants) */}
                          {ignoreQuery && group.fullUrls.length > 1 && group.fullUrls.map((fullUrl) => (
                            <button
                              key={fullUrl}
                              onClick={() => handleUrlSelect(fullUrl)}
                              className="w-full text-left pl-8 pr-4 py-1.5 text-xs font-mono text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 truncate block"
                              title={fullUrl}
                            >
                              {fullUrl}
                            </button>
                          ))}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-500 italic">
                        No matching URLs
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* URL not found in store */}
            {urlParamNotFound && (
              <div className="rounded-xl border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 px-5 py-4 text-sm text-orange-700 dark:text-orange-400">
                URL not found in loaded HAR data: <span className="font-mono break-all">{urlParam}</span>
              </div>
            )}

            {/* Selected URL banner */}
            {selectedUrl && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-5 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wider">Selected URL</p>
                  {ignoreQuery && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 italic">query strings ignored</span>
                  )}
                </div>
                <p className="font-mono text-sm text-slate-900 dark:text-slate-100 break-all">{selectedUrl}</p>
              </div>
            )}

            {/* Entry list */}
            {selectedUrl && urlEntries.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                    Entries
                    <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-500">
                      {urlEntries.length} total
                    </span>
                  </h2>
                </div>

                {urlEntries.length === 1 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                    Only one entry available — select at least two to diff
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="py-3 px-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Baseline
                        </th>
                        <th className="py-3 px-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Compare
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          HAR File
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          URL
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Status
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Content Type
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Size
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Timestamp (UTC)
                        </th>
                        <th className="py-3 px-4 bg-slate-100 dark:bg-slate-900/60" />
                      </tr>
                    </thead>
                    <tbody>
                      {urlEntries.map((entry) => {
                        const id = entryId(entry);
                        return (
                          <EntryRow
                            key={id}
                            entry={entry}
                            isBaseline={baselineId === id}
                            isCompare={compareId === id}
                            onSelectBaseline={() => setBaselineId(id)}
                            onSelectCompare={() => setCompareId(id)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Validation: same entry selected */}
            {sameEntrySelected && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 px-4 py-3 text-sm text-orange-700 dark:text-orange-400">
                Select two different entries to compare
              </div>
            )}

            {/* Diff panel */}
            {bothSelected && baselineEntry && compareEntry && (
              <div className="space-y-4">
                {/* Metadata bar */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Baseline', entry: baselineEntry },
                    { label: 'Compare',  entry: compareEntry  },
                  ].map(({ label, entry }) => (
                    <div key={label} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-xs font-mono space-y-0.5">
                      <p className="text-slate-500 dark:text-slate-500 uppercase tracking-wider text-xs font-semibold mb-1">{label}</p>
                      <p className="text-slate-700 dark:text-slate-300 truncate" title={entry.harFileName}>{entry.harFileName}</p>
                      <p className="text-blue-600 dark:text-blue-400 truncate" title={entry.url}>{entry.url}</p>
                      <div className="flex items-center gap-2 pt-0.5">
                        <StatusBadge code={entry.status} />
                        <span className="text-slate-500">{new Date(entry.startedDateTime).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Diff Mode
                  </span>
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      onClick={() => setDiffMode('unified')}
                      className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                        diffMode === 'unified'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Unified
                    </button>
                    <button
                      onClick={() => setDiffMode('side-by-side')}
                      className={`px-4 py-1.5 text-sm font-medium border-l border-slate-200 dark:border-slate-700 transition-colors ${
                        diffMode === 'side-by-side'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Side-by-Side
                    </button>
                  </div>
                </div>

                {/* Binary fallback */}
                {eitherBinary ? (
                  <BinaryFallback baseline={baselineEntry} compare={compareEntry} />
                ) : (
                  <>
                    {/* Identical banner */}
                    {diffData?.result.identical && (
                      <div className="rounded-lg border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20 px-5 py-3 text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Identical — both response bodies match exactly
                      </div>
                    )}

                    {/* JSON prettified label */}
                    {diffData?.result.prettified && (
                      <div className="text-xs text-slate-500 dark:text-slate-500 italic">
                        JSON prettified (2-space indent applied before diff)
                      </div>
                    )}

                    {/* Truncation notices */}
                    {diffData?.baseTruncated && (
                      <TruncationNotice
                        label="Baseline"
                        fullLength={diffData.baseFullLength}
                        showFull={showFullBaseline}
                        onToggle={() => setShowFullBaseline((v) => !v)}
                      />
                    )}
                    {diffData?.cmpTruncated && (
                      <TruncationNotice
                        label="Compare"
                        fullLength={diffData.cmpFullLength}
                        showFull={showFullCompare}
                        onToggle={() => setShowFullCompare((v) => !v)}
                      />
                    )}

                    {/* Diff view */}
                    {diffData && (
                      diffMode === 'unified'
                        ? <UnifiedDiffView result={diffData.result} />
                        : <SideBySideDiffView result={diffData.result} />
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — outer shell with Suspense boundary
// ---------------------------------------------------------------------------

export default function ContentDiffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
          Loading...
        </div>
      }
    >
      <ContentDiffPageContent />
    </Suspense>
  );
}
