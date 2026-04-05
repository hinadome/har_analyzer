'use client';

import { useState, useMemo, Suspense, Fragment } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { EntryRecord, HarAnalysis, DetailType } from '@/types/har';
import { loadHarStore } from '@/utils/storage';
import { formatBytes, formatTime, getContentSizeBucket } from '@/utils/harParser';
import StatusBadge from '@/components/StatusBadge';

interface GroupedByUrl {
  url: string;
  entries: EntryRecord[];
  byFile: Record<number, EntryRecord[]>;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 ${active ? 'text-blue-400' : 'text-slate-600'}`}>
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

type SortField = 'url' | 'status' | 'contentType' | 'contentSize' | 'time' | 'harFileName';

export default function DetailsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>}>
      <DetailsPageContent />
    </Suspense>
  );
}

function DetailsPageContent() {
  const searchParams = useSearchParams();
  const type = (searchParams.get('type') ?? 'url') as DetailType;
  const value = searchParams.get('value') ?? '';

  const [analyses] = useState<HarAnalysis[]>(() => loadHarStore()?.analyses ?? []);
  const [allEntries] = useState<EntryRecord[]>(() => loadHarStore()?.analyses.flatMap((a) => a.entries) ?? []);
  const [sortField, setSortField] = useState<SortField>('url');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtered = useMemo(() => {
    let entries = allEntries;

    if (type === 'status' && value) {
      entries = entries.filter((e) => String(e.status) === value);
    } else if (type === 'contentType' && value) {
      entries = entries.filter((e) => e.contentType === value);
    } else if (type === 'serverIPAddress' && value) {
      if (value === '(no IP)') {
        entries = entries.filter((e) => !(e.serverIPAddress ?? ''));
      } else {
        entries = entries.filter((e) => (e.serverIPAddress ?? '') === value);
      }
    } else if (type === 'contentSizeBucket' && value) {
      entries = entries.filter((e) => getContentSizeBucket(e.contentSize) === value);
    } else if (type === 'userAgent' && value) {
      entries = entries.filter((e) => (e.userAgent ?? '') === value);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      entries = entries.filter(
        (e) =>
          e.url.toLowerCase().includes(q) ||
          e.contentType.toLowerCase().includes(q) ||
          String(e.status).includes(q)
      );
    }

    return entries;
  }, [allEntries, type, value, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'url') cmp = a.url.localeCompare(b.url);
      else if (sortField === 'status') cmp = a.status - b.status;
      else if (sortField === 'contentType') cmp = a.contentType.localeCompare(b.contentType);
      else if (sortField === 'contentSize') cmp = a.contentSize - b.contentSize;
      else if (sortField === 'time') cmp = a.time - b.time;
      else if (sortField === 'harFileName') cmp = a.harFileName.localeCompare(b.harFileName);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  // For URL type: group by URL and show per-file comparison
  const groupedByUrl = useMemo<GroupedByUrl[]>(() => {
    if (type !== 'url') return [];
    const map = new Map<string, GroupedByUrl>();
    for (const e of filtered) {
      if (!map.has(e.url)) {
        map.set(e.url, { url: e.url, entries: [], byFile: {} });
      }
      const g = map.get(e.url)!;
      g.entries.push(e);
      if (!g.byFile[e.harFileIndex]) g.byFile[e.harFileIndex] = [];
      g.byFile[e.harFileIndex].push(e);
    }
    let groups = Array.from(map.values());
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      groups = groups.filter((g) => g.url.toLowerCase().includes(q));
    }
    return groups.sort((a, b) => a.url.localeCompare(b.url));
  }, [filtered, type, search]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const thClass = 'py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60 cursor-pointer select-none hover:text-slate-200 transition-colors';

  const title =
    type === 'status'
      ? `Status Code ${value}`
      : type === 'contentType'
      ? `Content Type: ${value}`
      : type === 'contentSizeBucket'
      ? `Content Size: ${value}`
      : type === 'serverIPAddress'
      ? value === '(no IP)' ? 'Requests with No Server IP' : `Server IP: ${value}`
      : type === 'userAgent'
      ? `User Agent: ${value}`
      : 'All URLs';

  if (!allEntries.length) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400 text-lg">No HAR data loaded.</p>
          <Link href="/" className="text-blue-400 hover:text-blue-300 underline">
            ← Back to upload
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div className="h-5 w-px bg-slate-700" />
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h1 className="text-xl font-bold tracking-tight">HAR Analyzer</h1>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">{title}</h2>
            <p className="text-slate-500 text-sm mt-1">
              {type === 'url' ? groupedByUrl.length.toLocaleString() + ' unique URLs' : filtered.length.toLocaleString() + ' entries'} across {analyses.length} file{analyses.length !== 1 ? 's' : ''}
              {type === 'userAgent' && value && (
                <span className="block text-xs text-slate-600 font-mono mt-1 break-all max-w-2xl">{value}</span>
              )}
            </p>
          </div>
          <input
            type="text"
            placeholder="Filter..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-64"
          />
        </div>

        {type === 'url' ? (
          <UrlGroupTable groups={groupedByUrl} analyses={analyses} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={thClass} onClick={() => toggleSort('url')}>
                      URL <SortIcon active={sortField === 'url'} dir={sortDir} />
                    </th>
                    <th className={thClass} onClick={() => toggleSort('status')}>
                      Status <SortIcon active={sortField === 'status'} dir={sortDir} />
                    </th>
                    <th className={thClass} onClick={() => toggleSort('contentType')}>
                      Content Type <SortIcon active={sortField === 'contentType'} dir={sortDir} />
                    </th>
                    <th className={thClass} onClick={() => toggleSort('contentSize')}>
                      Size <SortIcon active={sortField === 'contentSize'} dir={sortDir} />
                    </th>
                    <th className={thClass} onClick={() => toggleSort('time')}>
                      Time <SortIcon active={sortField === 'time'} dir={sortDir} />
                    </th>
                    <th className={thClass} onClick={() => toggleSort('harFileName')}>
                      HAR File <SortIcon active={sortField === 'harFileName'} dir={sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-800/50 transition-colors border-t border-slate-700/50">
                      <td className="py-2.5 px-4 text-sm max-w-xs">
                        <Link
                          href={`/compare?url=${encodeURIComponent(e.url)}`}
                          className="text-blue-400 hover:text-blue-300 hover:underline font-mono text-xs break-all"
                          title={e.url}
                        >
                          {e.url.length > 80 ? e.url.slice(0, 80) + '…' : e.url}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-sm">
                        <Link href={`/details?type=status&value=${e.status}`}>
                          <StatusBadge code={e.status} />
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-sm">
                        <Link
                          href={`/details?type=contentType&value=${encodeURIComponent(e.contentType)}`}
                          className="text-purple-400 hover:text-purple-300 hover:underline font-mono text-xs"
                        >
                          {e.contentType}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-sm font-mono text-slate-300 text-right">
                        {formatBytes(e.contentSize)}
                      </td>
                      <td className="py-2.5 px-4 text-sm font-mono text-slate-300 text-right">
                        {formatTime(e.time)}
                      </td>
                      <td className="py-2.5 px-4 text-sm text-slate-400 font-mono text-xs max-w-[160px] truncate" title={e.harFileName}>
                        {e.harFileName}
                      </td>
                    </tr>
                  ))}
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">No entries found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>
                  Showing {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, sorted.length).toLocaleString()} of {sorted.length.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function UrlGroupTable({ groups, analyses }: { groups: GroupedByUrl[]; analyses: HarAnalysis[] }) {
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

  if (groups.length === 0) {
    return <p className="text-center py-12 text-slate-500">No URLs found</p>;
  }

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60 w-10" />
              <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">URL</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Total Hits</th>
              {analyses.map((a) => (
                <th key={a.fileIndex} className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60 min-w-[120px]">
                  <span className="block truncate max-w-[130px] ml-auto" title={a.fileName}>{a.fileName}</span>
                </th>
              ))}
              <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Avg Size</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Avg Time</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isExpanded = expandedUrl === g.url;
              const avgSize = g.entries.reduce((s, e) => s + e.contentSize, 0) / g.entries.length;
              const avgTime = g.entries.reduce((s, e) => s + e.time, 0) / g.entries.length;

              return (
                <Fragment key={g.url}>
                  <tr
                    className="hover:bg-slate-800/50 transition-colors border-t border-slate-700/50 cursor-pointer"
                    onClick={() => setExpandedUrl(isExpanded ? null : g.url)}
                  >
                    <td className="py-2.5 px-4 text-slate-500">
                      <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                    </td>
                    <td className="py-2.5 px-4 text-sm max-w-xs" onClick={(ev) => ev.stopPropagation()}>
                      <Link
                        href={`/compare?url=${encodeURIComponent(g.url)}`}
                        className="text-blue-400 hover:text-blue-300 hover:underline font-mono text-xs break-all"
                        title={g.url}
                      >
                        {g.url.length > 80 ? g.url.slice(0, 80) + '…' : g.url}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 text-sm text-right font-mono text-slate-300">{g.entries.length}</td>
                    {analyses.map((a) => (
                      <td key={a.fileIndex} className="py-2.5 px-4 text-sm text-right font-mono text-slate-300">
                        {g.byFile[a.fileIndex]?.length ?? <span className="text-slate-600">—</span>}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-sm text-right font-mono text-slate-300">{formatBytes(avgSize)}</td>
                    <td className="py-2.5 px-4 text-sm text-right font-mono text-slate-300">{formatTime(avgTime)}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${g.url}-expanded`} className="border-t border-slate-700/50">
                      <td colSpan={5 + analyses.length} className="p-0">
                        <div className="bg-slate-900/60 border-l-2 border-blue-500/40 px-6 py-4">
                          <p className="text-xs text-slate-400 font-mono break-all mb-3">{g.url}</p>
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="text-xs text-slate-500 uppercase">
                                <th className="text-left pb-2 pr-4">HAR File</th>
                                <th className="text-right pb-2 pr-4">Status</th>
                                <th className="text-right pb-2 pr-4">Content Type</th>
                                <th className="text-right pb-2 pr-4">Size</th>
                                <th className="text-right pb-2">Time</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.entries.map((e, i) => (
                                <tr key={i} className="border-t border-slate-700/30">
                                  <td className="py-1.5 pr-4 font-mono text-xs text-slate-400 truncate max-w-[150px]">{e.harFileName}</td>
                                  <td className="py-1.5 pr-4 text-right">
                                    <Link href={`/details?type=status&value=${e.status}`} onClick={(ev) => ev.stopPropagation()}>
                                      <StatusBadge code={e.status} />
                                    </Link>
                                  </td>
                                  <td className="py-1.5 pr-4 text-right">
                                    <Link
                                      href={`/details?type=contentType&value=${encodeURIComponent(e.contentType)}`}
                                      className="text-purple-400 hover:text-purple-300 text-xs font-mono"
                                      onClick={(ev) => ev.stopPropagation()}
                                    >
                                      {e.contentType}
                                    </Link>
                                  </td>
                                  <td className="py-1.5 pr-4 font-mono text-slate-300 text-right text-xs">{formatBytes(e.contentSize)}</td>
                                  <td className="py-1.5 font-mono text-slate-300 text-right text-xs">{formatTime(e.time)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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
