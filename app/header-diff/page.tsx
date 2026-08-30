'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import HeaderDiffView from '@/components/HeaderDiffView';
import { PageShell } from '@/components/shell/PageShell';
import { EmptyState } from '@/components/shell/EmptyState';
import { LoadingState } from '@/components/shell/LoadingState';
import { useHarStore } from '@/hooks/useHarStore';
import { entryId, stripQuery, buildUrlGroups } from '@/utils/contentDiff';
import { computeHeaderDiff } from '@/utils/headerDiff';
import type { EntryRecord } from '@/types/har';
import type { UrlGroup } from '@/utils/contentDiff';

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
  const utc = entry.startedDateTime
    ? new Date(entry.startedDateTime).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC'
    : '—';

  return (
    <tr className="border-t border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
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
      <td className="py-3 px-4 text-sm font-mono text-slate-700 dark:text-slate-300 max-w-[180px]">
        <span className="truncate block max-w-[180px]" title={entry.harFileName}>{entry.harFileName}</span>
      </td>
      <td className="py-3 px-4 text-xs font-mono text-blue-600 dark:text-blue-400 max-w-[260px]">
        <Link
          href={`/compare?url=${encodeURIComponent(entry.url)}`}
          className="truncate block max-w-[260px] hover:underline"
          title={entry.url}
        >
          {entry.url}
        </Link>
      </td>
      <td className="py-3 px-4 text-sm"><StatusBadge code={entry.status} /></td>
      <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400 text-right">
        {entry.requestHeaders.length} / {entry.responseHeaders.length}
      </td>
      <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400 text-right">
        {entry.requestCookies.length} / {entry.responseCookies.length}
      </td>
      <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">{utc}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function HeaderDiffPageContent() {
  const searchParams = useSearchParams();
  const urlParam = searchParams.get('url') ?? '';

  const { analyses, isLoading } = useHarStore();

  const [urlInput, setUrlInput]       = useState(urlParam);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(urlParam || null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [ignoreQuery, setIgnoreQuery]  = useState(false);
  const [baselineId, setBaselineId]   = useState<string | null>(null);
  const [compareId, setCompareId]     = useState<string | null>(null);

  const allUrls = useMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const a of analyses) for (const e of a.entries) seen.add(e.url);
    return Array.from(seen).sort();
  }, [analyses]);

  const urlGroups = useMemo<UrlGroup[]>(() => {
    if (!urlInput) return [];
    const q = urlInput.toLowerCase();
    const matching = allUrls.filter((u) => u.toLowerCase().includes(q));
    return buildUrlGroups(matching, ignoreQuery);
  }, [allUrls, urlInput, ignoreQuery]);

  const urlEntries = useMemo<EntryRecord[]>(() => {
    if (!selectedUrl) return [];
    const all = analyses.flatMap((a) => a.entries);
    if (ignoreQuery) {
      const base = stripQuery(selectedUrl);
      return all.filter((e) => stripQuery(e.url) === base);
    }
    return all.filter((e) => e.url === selectedUrl);
  }, [analyses, selectedUrl, ignoreQuery]);

  const baselineEntry = useMemo<EntryRecord | null>(
    () => (baselineId ? urlEntries.find((e) => entryId(e) === baselineId) ?? null : null),
    [urlEntries, baselineId]
  );
  const compareEntry = useMemo<EntryRecord | null>(
    () => (compareId ? urlEntries.find((e) => entryId(e) === compareId) ?? null : null),
    [urlEntries, compareId]
  );

  const diffResult = useMemo(() => {
    if (!baselineEntry || !compareEntry || baselineId === compareId) return null;
    return computeHeaderDiff(baselineEntry, compareEntry);
  }, [baselineEntry, compareEntry, baselineId, compareId]);

  const handleUrlInputChange = (v: string) => {
    setUrlInput(v);
    setShowDropdown(true);
    if (!v) { setSelectedUrl(null); setBaselineId(null); setCompareId(null); }
  };

  const handleUrlSelect = (url: string) => {
    setUrlInput(url);
    setSelectedUrl(url);
    setShowDropdown(false);
    setBaselineId(null);
    setCompareId(null);
  };

  const handleClear = () => {
    setUrlInput(''); setSelectedUrl(null); setShowDropdown(false);
    setBaselineId(null); setCompareId(null);
  };

  const sameEntrySelected = baselineId !== null && baselineId === compareId;
  const bothSelected = baselineEntry !== null && compareEntry !== null && !sameEntrySelected;

  const urlParamNotFound =
    urlParam && !isLoading && analyses.length > 0 &&
    !allUrls.some((u) => (ignoreQuery ? stripQuery(u) === stripQuery(urlParam) : u === urlParam));

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  return (
    <PageShell
      back={{ href: '/', label: 'Home' }}
      crumb="Header Diff"
      mainClassName="space-y-6"
    >
        {!analyses.length ? (
          <EmptyState title="No HAR data loaded." />
        ) : (
          <>
            {/* URL Search */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Search URL</label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={ignoreQuery} onChange={(e) => { setIgnoreQuery(e.target.checked); setBaselineId(null); setCompareId(null); }} className="accent-blue-600" />
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
                    className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                  />
                  {urlInput && (
                    <button onClick={handleClear} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm">
                      Clear
                    </button>
                  )}
                </div>
                {showDropdown && urlInput && (
                  <div className="absolute z-20 w-full mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-72 overflow-y-auto">
                    {urlGroups.length > 0 ? urlGroups.map((group) => (
                      <div key={group.basePath}>
                        <button
                          onClick={() => handleUrlSelect(group.basePath)}
                          className="w-full text-left px-4 py-2 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors border-b border-slate-100 dark:border-slate-800 truncate block"
                          title={group.basePath}
                        >
                          {group.basePath}
                        </button>
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
                    )) : (
                      <div className="px-4 py-3 text-sm text-slate-500 italic">No matching URLs</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {urlParamNotFound && (
              <div className="rounded-xl border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 px-5 py-4 text-sm text-orange-700 dark:text-orange-400">
                URL not found in loaded HAR data: <span className="font-mono break-all">{urlParam}</span>
              </div>
            )}

            {selectedUrl && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-5 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Selected URL</p>
                  {ignoreQuery && <span className="text-xs text-amber-600 dark:text-amber-400 italic">query strings ignored</span>}
                </div>
                <p className="font-mono text-sm text-slate-900 dark:text-slate-100 break-all">{selectedUrl}</p>
              </div>
            )}

            {/* Entry list */}
            {selectedUrl && urlEntries.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                  Entries
                  <span className="ml-2 text-sm font-normal text-slate-500">{urlEntries.length} total</span>
                </h2>

                {urlEntries.length === 1 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                    Only one entry available — select at least two to diff
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Baseline', 'Compare', 'HAR File', 'URL', 'Status', 'Req/Res Headers', 'Req/Res Cookies', 'Timestamp (UTC)'].map((h) => (
                          <th key={h} className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
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

            {sameEntrySelected && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 px-4 py-3 text-sm text-orange-700 dark:text-orange-400">
                Select two different entries to compare
              </div>
            )}

            {/* Diff panel */}
            {bothSelected && diffResult && (
              <div className="space-y-4">
                {/* Metadata bar */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Baseline', entry: baselineEntry! },
                    { label: 'Compare',  entry: compareEntry!  },
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

                {/* Identical banner */}
                {diffResult.identical && (
                  <div className="rounded-lg border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20 px-5 py-3 text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Identical — all headers and cookies match exactly
                  </div>
                )}

                <HeaderDiffView result={diffResult} />
              </div>
            )}
          </>
        )}
    </PageShell>
  );
}

export default function HeaderDiffPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <HeaderDiffPageContent />
    </Suspense>
  );
}
