'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { HarAnalysis, EntryRecord } from '@/types/har';
import { loadHarStore } from '@/utils/storage';
import { formatBytes, formatTime } from '@/utils/harParser';
import StatusBadge from '@/components/StatusBadge';
import { statusColorClass } from '@/components/StatusBadge';

type SortField = 'url' | 'status' | 'contentType' | 'contentSize' | 'time';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 ${active ? 'text-blue-400' : 'text-slate-600'}`}>
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

export default function FileDetailPage() {
  const params = useParams<{ index: string }>();
  const fileIndex = parseInt(params.index ?? '0', 10);

  const [analysis] = useState<HarAnalysis | null>(() => loadHarStore()?.analyses[fileIndex] ?? null);
  const [notFound] = useState(() => {
    const store = loadHarStore();
    return !store || !store.analyses[fileIndex];
  });
  const [sortField, setSortField] = useState<SortField>('url');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtered = useMemo<EntryRecord[]>(() => {
    if (!analysis) return [];
    if (!search.trim()) return analysis.entries;
    const q = search.trim().toLowerCase();
    return analysis.entries.filter(
      (e) =>
        e.url.toLowerCase().includes(q) ||
        e.contentType.toLowerCase().includes(q) ||
        String(e.status).includes(q)
    );
  }, [analysis, search]);

  const sorted = useMemo<EntryRecord[]>(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'url') cmp = a.url.localeCompare(b.url);
      else if (sortField === 'status') cmp = a.status - b.status;
      else if (sortField === 'contentType') cmp = a.contentType.localeCompare(b.contentType);
      else if (sortField === 'contentSize') cmp = a.contentSize - b.contentSize;
      else if (sortField === 'time') cmp = a.time - b.time;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  };

  const statusBreakdown = useMemo(() => {
    if (!analysis) return [];
    return Object.entries(analysis.statusCodeCounts)
      .map(([code, count]) => ({ code: Number(code), count }))
      .sort((a, b) => a.code - b.code);
  }, [analysis]);

  const contentTypeBreakdown = useMemo(() => {
    if (!analysis) return [];
    return Object.entries(analysis.contentTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [analysis]);

  const thClass = 'py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60 cursor-pointer select-none hover:text-slate-200 transition-colors';

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400 text-lg">File not found.</p>
          <Link href="/" className="text-blue-400 hover:text-blue-300 underline">← Back to upload</Link>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">
        Loading...
      </div>
    );
  }

  const uniqueStatuses = Object.keys(analysis.statusCodeCounts).length;
  const uniqueContentTypes = Object.keys(analysis.contentTypeCounts).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 text-sm">
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Title */}
        <div>
          <h2 className="text-2xl font-bold text-slate-100 font-mono break-all">{analysis.fileName}</h2>
          <p className="text-slate-500 text-sm mt-1">File index {fileIndex}</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Requests', value: analysis.totalRequests.toLocaleString() },
            { label: 'Unique URLs', value: analysis.uniqueUrlCount.toLocaleString() },
            { label: 'Status Codes', value: uniqueStatuses.toLocaleString() },
            { label: 'Content Types', value: uniqueContentTypes.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-2xl font-bold font-mono text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        {/* Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Status Codes */}
          <div>
            <h3 className="text-base font-semibold text-slate-200 mb-3">Status Codes</h3>
            <div className="rounded-xl border border-slate-700 overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Code</th>
                    <th className="py-2.5 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Count</th>
                    <th className="py-2.5 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">%</th>
                  </tr>
                </thead>
                <tbody>
                  {statusBreakdown.map(({ code, count }) => (
                    <tr key={code} className="border-t border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-4">
                        <Link
                          href={`/details?type=status&value=${code}`}
                          className={`${statusColorClass(code)} hover:underline font-mono font-semibold text-sm`}
                        >
                          {code}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm text-slate-300">{count.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm text-slate-400">
                        {((count / analysis.totalRequests) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Content Types */}
          <div>
            <h3 className="text-base font-semibold text-slate-200 mb-3">Content Types</h3>
            <div className="rounded-xl border border-slate-700 overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Type</th>
                    <th className="py-2.5 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Count</th>
                    <th className="py-2.5 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">%</th>
                  </tr>
                </thead>
                <tbody>
                  {contentTypeBreakdown.map(({ type, count }) => (
                    <tr key={type} className="border-t border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-4">
                        <Link
                          href={`/details?type=contentType&value=${encodeURIComponent(type)}`}
                          className="text-purple-400 hover:text-purple-300 hover:underline font-mono text-xs"
                        >
                          {type}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm text-slate-300">{count.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm text-slate-400">
                        {((count / analysis.totalRequests) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Entry Table */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <h3 className="text-base font-semibold text-slate-200">
              All Requests
              <span className="ml-2 text-sm font-normal text-slate-500">{filtered.length.toLocaleString()} entries</span>
            </h3>
            <input
              type="text"
              placeholder="Filter by URL, status, content type..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-72"
            />
          </div>

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
                    <td className="py-2.5 px-4 text-sm font-mono text-slate-300 text-right">{formatBytes(e.contentSize)}</td>
                    <td className="py-2.5 px-4 text-sm font-mono text-slate-300 text-right">{formatTime(e.time)}</td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">No entries found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-400 mt-4">
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
                <span className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded">{page} / {totalPages}</span>
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
        </div>
      </main>
    </div>
  );
}
