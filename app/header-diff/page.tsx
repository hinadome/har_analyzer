'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import HeaderDiffView from '@/components/HeaderDiffView';
import { PageShell } from '@/components/shell/PageShell';
import { EmptyState } from '@/components/shell/EmptyState';
import { LoadingState } from '@/components/shell/LoadingState';
import { UrlPathPicker } from '@/components/shared/UrlPathPicker';
import { useHarStore } from '@/hooks/useHarStore';
import { useUrlPathSelection } from '@/hooks/useUrlPathSelection';
import { entryId, filterEntriesBySelection } from '@/utils/contentDiff';
import { computeHeaderDiff } from '@/utils/headerDiff';
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

  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);

  const allUrls = useMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const a of analyses) for (const e of a.entries) seen.add(e.url);
    return Array.from(seen).sort();
  }, [analyses]);

  const {
    urlInput,
    selectedUrl,
    matchExactUrl,
    showDropdown,
    urlGroups,
    urlParamNotFound,
    handleUrlInputChange,
    handleUrlSelect,
    handleClear,
    handleMatchExactUrlChange,
    setShowDropdown,
  } = useUrlPathSelection({
    allUrls,
    urlParam,
    onSelectionReset: () => {
      setBaselineId(null);
      setCompareId(null);
    },
  });

  const urlEntries = useMemo<EntryRecord[]>(() => {
    if (!selectedUrl) return [];
    return filterEntriesBySelection(
      analyses.flatMap((a) => a.entries),
      selectedUrl,
      matchExactUrl,
    );
  }, [analyses, selectedUrl, matchExactUrl]);

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

  const sameEntrySelected = baselineId !== null && baselineId === compareId;
  const bothSelected = baselineEntry !== null && compareEntry !== null && !sameEntrySelected;

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
            <UrlPathPicker
              urlInput={urlInput}
              onUrlInputChange={handleUrlInputChange}
              matchExactUrl={matchExactUrl}
              onMatchExactUrlChange={handleMatchExactUrlChange}
              showDropdown={showDropdown}
              onShowDropdownChange={setShowDropdown}
              urlGroups={urlGroups}
              onSelect={handleUrlSelect}
              onClear={handleClear}
              selectedUrl={selectedUrl}
              urlParamNotFound={!isLoading && analyses.length > 0 && urlParamNotFound}
              urlParam={urlParam}
            />

            {/* Entry list */}
            {selectedUrl && urlEntries.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                  Entries
                  <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-500">
                    {urlEntries.length} total
                  </span>
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
                        <th className="py-3 px-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap">
                          Baseline
                        </th>
                        <th className="py-3 px-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap">
                          Compare
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap">
                          HAR File
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap">
                          URL
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap">
                          Status
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap">
                          Req/Res Headers
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap">
                          Req/Res Cookies
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap">
                          Timestamp (UTC)
                        </th>
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
