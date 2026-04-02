'use client';

import { useState, useMemo, Suspense, Fragment } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { HarAnalysis, EntryRecord, HarHeader } from '@/types/har';
import { loadHarStore } from '@/utils/storage';
import { formatBytes, formatTime } from '@/utils/harParser';
import StatusBadge from '@/components/StatusBadge';
import { statusColorClass } from '@/components/StatusBadge';

type SortField = 'harFileName' | 'status' | 'contentType' | 'contentSize' | 'time' | 'serverIPAddress' | 'userAgent';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 ${active ? 'text-blue-400' : 'text-slate-600'}`}>
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

function HeaderTable({ headers }: { headers: HarHeader[] }) {
  if (!headers.length) return <p className="text-slate-600 text-xs italic">None</p>;
  return (
    <table className="w-full text-xs border-collapse">
      <tbody>
        {headers.map((h, i) => (
          <tr key={i} className="border-t border-slate-700/30">
            <td className="py-0.5 pr-3 font-semibold text-slate-400 font-mono w-1/3 align-top break-all">{h.name}</td>
            <td className="py-0.5 text-slate-300 font-mono break-all">{h.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CookieTable({ cookies }: { cookies: Array<{ name: string; value: string }> }) {
  if (!cookies.length) return <p className="text-slate-600 text-xs italic">None</p>;
  return (
    <table className="w-full text-xs border-collapse">
      <tbody>
        {cookies.map((c, i) => (
          <tr key={i} className="border-t border-slate-700/30">
            <td className="py-0.5 pr-3 font-semibold text-slate-400 font-mono w-1/3 align-top break-all">{c.name}</td>
            <td className="py-0.5 text-slate-300 font-mono break-all">{c.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EntryDetail({ entry }: { entry: EntryRecord }) {
  const [tab, setTab] = useState<'req' | 'res'>('req');
  const tabBase = 'px-3 py-1.5 text-xs font-medium rounded transition-colors';
  const tabActive = `${tabBase} bg-slate-700 text-slate-100`;
  const tabInactive = `${tabBase} text-slate-500 hover:text-slate-300`;

  const reqHeaders = entry.requestHeaders ?? [];
  const resHeaders = entry.responseHeaders ?? [];
  const reqCookies = entry.requestCookies ?? [];
  const resCookies = entry.responseCookies ?? [];

  return (
    <div className="mt-2 border border-slate-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border-b border-slate-700/50">
        <StatusBadge code={entry.status} />
        <span className="text-xs font-mono text-slate-400">{entry.method}</span>
        <span className="text-xs font-mono text-slate-500 ml-auto">{formatBytes(entry.contentSize)} · {formatTime(entry.time)}</span>
      </div>
      <div className="px-3 py-2 bg-slate-900/40">
        <div className="flex gap-1 mb-3">
          <button className={tab === 'req' ? tabActive : tabInactive} onClick={() => setTab('req')}>
            Request
            {reqCookies.length > 0 && (
              <span className="ml-1.5 text-xs bg-slate-600 text-slate-300 rounded px-1">{reqCookies.length} cookies</span>
            )}
          </button>
          <button className={tab === 'res' ? tabActive : tabInactive} onClick={() => setTab('res')}>
            Response
            {resCookies.length > 0 && (
              <span className="ml-1.5 text-xs bg-slate-600 text-slate-300 rounded px-1">{resCookies.length} cookies</span>
            )}
          </button>
        </div>
        {tab === 'req' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Headers ({reqHeaders.length})</p>
              <HeaderTable headers={reqHeaders} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Cookies ({reqCookies.length})</p>
              <CookieTable cookies={reqCookies} />
            </div>
          </div>
        )}
        {tab === 'res' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Headers ({resHeaders.length})</p>
              <HeaderTable headers={resHeaders} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Cookies ({resCookies.length})</p>
              <CookieTable cookies={resCookies} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface FileSummaryRow {
  analysis: HarAnalysis;
  hits: number;
  statuses: number[];
  contentTypes: string[];
  avgSize: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  serverIPs: string[];
  userAgents: string[];
  entries: EntryRecord[];
}

function PerFileRow({ row }: { row: FileSummaryRow }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedEntryIdx, setExpandedEntryIdx] = useState<number | null>(null);
  const { analysis, hits, statuses, contentTypes, avgSize, avgTime, minTime, maxTime, serverIPs, userAgents, entries } = row;

  return (
    <Fragment key={analysis.fileIndex}>
      <tr className="border-t border-slate-700/50 hover:bg-slate-800/40 transition-colors">
        {/* Expand toggle */}
        <td className="py-3 px-4 text-sm w-8">
          {hits > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-500 hover:text-slate-200 transition-colors"
              title={expanded ? 'Collapse' : 'Expand requests'}
            >
              <span className="text-xs">{expanded ? '▼' : '▶'}</span>
            </button>
          )}
        </td>
        <td className="py-3 px-4 text-sm">
          <Link
            href={`/file/${analysis.fileIndex}`}
            className="text-slate-200 hover:text-blue-300 hover:underline font-mono text-xs truncate max-w-[200px] block"
            title={analysis.fileName}
          >
            {analysis.fileName}
          </Link>
        </td>
        <td className="py-3 px-4 text-sm text-right font-mono">
          {hits > 0 ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-200 font-semibold hover:text-blue-300 transition-colors"
            >
              {hits}
            </button>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm">
          {hits > 0 ? (
            <div className="flex flex-wrap gap-1">
              {statuses.map((code) => (
                <Link key={code} href={`/details?type=status&value=${code}`}>
                  <span className={`font-mono text-xs font-semibold ${statusColorClass(code)}`}>{code}</span>
                </Link>
              ))}
            </div>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm">
          {hits > 0 ? (
            <div className="flex flex-wrap gap-1">
              {contentTypes.map((ct) => (
                <Link
                  key={ct}
                  href={`/details?type=contentType&value=${encodeURIComponent(ct)}`}
                  className="text-purple-400 hover:text-purple-300 hover:underline font-mono text-xs"
                >
                  {ct}
                </Link>
              ))}
            </div>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-right font-mono text-slate-300">
          {hits > 0 ? formatBytes(avgSize) : <span className="text-slate-600">—</span>}
        </td>
        <td className="py-3 px-4 text-sm text-right font-mono text-slate-300">
          {hits > 0 ? formatTime(avgTime) : <span className="text-slate-600">—</span>}
        </td>
        <td className="py-3 px-4 text-sm text-right font-mono text-slate-400 text-xs">
          {hits > 0 ? (
            <span>{formatTime(minTime)} / {formatTime(maxTime)}</span>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm font-mono text-xs text-slate-300">
          {hits > 0 && serverIPs.length > 0 ? (
            <div className="space-y-0.5">
              {serverIPs.map((ip) => (
                <div key={ip}>
                  <Link
                    href={`/details?type=serverIPAddress&value=${encodeURIComponent(ip)}`}
                    className="text-cyan-400 hover:text-cyan-300 hover:underline"
                  >
                    {ip}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm font-mono text-xs text-slate-300 max-w-[200px]">
          {hits > 0 && userAgents.length > 0 ? (
            <div className="space-y-0.5">
              {userAgents.map((ua, i) => (
                <div key={i} className="truncate max-w-[200px]" title={ua}>
                  <Link
                    href={`/details?type=userAgent&value=${encodeURIComponent(ua)}`}
                    className="text-amber-400 hover:text-amber-300 hover:underline"
                  >
                    {ua}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-700/30">
          <td colSpan={10} className="p-0">
            <div className="bg-slate-900/60 border-l-2 border-blue-500/40 px-6 py-4 space-y-3">
              {entries.map((entry, idx) => (
                <div key={idx} className="space-y-1">
                  {/* Request summary header — clickable to expand headers/cookies */}
                  <button
                    className="w-full text-left flex items-center gap-3 group"
                    onClick={() => setExpandedEntryIdx(expandedEntryIdx === idx ? null : idx)}
                  >
                    <span className="text-slate-500 text-xs group-hover:text-slate-300 transition-colors">
                      {expandedEntryIdx === idx ? '▼' : '▶'}
                    </span>
                    <StatusBadge code={entry.status} />
                    <span className="text-xs font-mono text-slate-400">{entry.method}</span>
                    <span className="text-xs font-mono text-slate-500">{formatBytes(entry.contentSize)}</span>
                    <span className="text-xs font-mono text-slate-500">{formatTime(entry.time)}</span>
                    <Link
                      href={`/details?type=contentType&value=${encodeURIComponent(entry.contentType)}`}
                      className="text-purple-400 hover:text-purple-300 font-mono text-xs ml-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.contentType}
                    </Link>
                  </button>
                  {expandedEntryIdx === idx && <EntryDetail entry={entry} />}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>}>
      <ComparePageContent />
    </Suspense>
  );
}

function ComparePageContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url') ?? '';

  const [analyses] = useState<HarAnalysis[]>(() => loadHarStore()?.analyses ?? []);
  const [allEntries] = useState<EntryRecord[]>(() => loadHarStore()?.analyses.flatMap((a) => a.entries) ?? []);

  const [sortField, setSortField] = useState<SortField>('harFileName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const urlEntries = useMemo(
    () => allEntries.filter((e) => e.url === url),
    [allEntries, url]
  );

  const perFileSummary = useMemo<FileSummaryRow[]>(() => {
    return analyses.map((a) => {
      const entries = urlEntries.filter((e) => e.harFileIndex === a.fileIndex);
      const hits = entries.length;
      const statuses = [...new Set(entries.map((e) => e.status))].sort();
      const contentTypes = [...new Set(entries.map((e) => e.contentType))];
      const avgSize = hits > 0 ? entries.reduce((s, e) => s + e.contentSize, 0) / hits : 0;
      const avgTime = hits > 0 ? entries.reduce((s, e) => s + e.time, 0) / hits : 0;
      const minTime = hits > 0 ? Math.min(...entries.map((e) => e.time)) : 0;
      const maxTime = hits > 0 ? Math.max(...entries.map((e) => e.time)) : 0;
      const serverIPs = [...new Set(entries.map((e) => e.serverIPAddress ?? '').filter(Boolean))];
      const userAgents = [...new Set(entries.map((e) => e.userAgent ?? '').filter(Boolean))];
      return { analysis: a, hits, statuses, contentTypes, avgSize, avgTime, minTime, maxTime, serverIPs, userAgents, entries };
    });
  }, [analyses, urlEntries]);

  const sortedEntries = useMemo(() => {
    return [...urlEntries].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'harFileName') cmp = a.harFileName.localeCompare(b.harFileName);
      else if (sortField === 'status') cmp = a.status - b.status;
      else if (sortField === 'contentType') cmp = a.contentType.localeCompare(b.contentType);
      else if (sortField === 'contentSize') cmp = a.contentSize - b.contentSize;
      else if (sortField === 'time') cmp = a.time - b.time;
      else if (sortField === 'serverIPAddress') cmp = (a.serverIPAddress ?? '').localeCompare(b.serverIPAddress ?? '');
      else if (sortField === 'userAgent') cmp = (a.userAgent ?? '').localeCompare(b.userAgent ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [urlEntries, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / pageSize));
  const paginated = sortedEntries.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  };

  const thClass = 'py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60 cursor-pointer select-none hover:text-slate-200 transition-colors';

  if (!url) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400 text-lg">No URL specified.</p>
          <Link href="/details?type=url" className="text-blue-400 hover:text-blue-300 underline">← Back to All URLs</Link>
        </div>
      </div>
    );
  }

  if (!allEntries.length) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400 text-lg">No HAR data loaded.</p>
          <Link href="/" className="text-blue-400 hover:text-blue-300 underline">← Back to upload</Link>
        </div>
      </div>
    );
  }

  if (urlEntries.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400 text-lg">URL not found in loaded HAR files.</p>
          <Link href="/details?type=url" className="text-blue-400 hover:text-blue-300 underline">← Back to All URLs</Link>
        </div>
      </div>
    );
  }

  const totalHits = urlEntries.length;
  const filesWithUrl = perFileSummary.filter((r) => r.hits > 0).length;
  const overallAvgTime = urlEntries.reduce((s, e) => s + e.time, 0) / totalHits;
  const overallAvgSize = urlEntries.reduce((s, e) => s + e.contentSize, 0) / totalHits;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/details?type=url"
            className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All URLs
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
        {/* URL Title */}
        <div>
          <h2 className="text-lg font-semibold text-slate-400 mb-1">URL Comparison</h2>
          <p className="text-slate-100 font-mono text-sm break-all bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-300">
              {url}
            </a>
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Hits', value: totalHits.toLocaleString() },
            { label: 'Files with URL', value: `${filesWithUrl} / ${analyses.length}` },
            { label: 'Avg Time', value: formatTime(overallAvgTime) },
            { label: 'Avg Size', value: formatBytes(overallAvgSize) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-2xl font-bold font-mono text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        {/* Per-file comparison table */}
        <div>
          <h3 className="text-base font-semibold text-slate-200 mb-1">Per-File Comparison</h3>
          <p className="text-xs text-slate-500 mb-3">Click the arrow or hit count to expand requests. Click a request to view headers and cookies.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="py-3 px-4 bg-slate-900/60 w-8" />
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">HAR File</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Hits</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Status Codes</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Content Types</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Avg Size</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Avg Time</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Min / Max Time</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">Server IP</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">User Agent</th>
                </tr>
              </thead>
              <tbody>
                {perFileSummary.map((row) => (
                  <PerFileRow key={row.analysis.fileIndex} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* All entries table */}
        <div>
          <h3 className="text-base font-semibold text-slate-200 mb-3">
            All Entries
            <span className="ml-2 text-sm font-normal text-slate-500">{urlEntries.length.toLocaleString()} total</span>
          </h3>

          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={thClass} onClick={() => toggleSort('harFileName')}>
                    HAR File <SortIcon active={sortField === 'harFileName'} dir={sortDir} />
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
                  <th className={thClass} onClick={() => toggleSort('serverIPAddress')}>
                    Server IP <SortIcon active={sortField === 'serverIPAddress'} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => toggleSort('userAgent')}>
                    User Agent <SortIcon active={sortField === 'userAgent'} dir={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-800/50 transition-colors border-t border-slate-700/50">
                    <td className="py-2.5 px-4 text-sm">
                      <Link
                        href={`/file/${e.harFileIndex}`}
                        className="text-slate-300 hover:text-blue-300 hover:underline font-mono text-xs truncate max-w-[180px] block"
                        title={e.harFileName}
                      >
                        {e.harFileName}
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
                    <td className="py-2.5 px-4 text-sm font-mono text-xs">
                      {e.serverIPAddress ? (
                        <Link
                          href={`/details?type=serverIPAddress&value=${encodeURIComponent(e.serverIPAddress)}`}
                          className="text-cyan-400 hover:text-cyan-300 hover:underline"
                        >
                          {e.serverIPAddress}
                        </Link>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-sm font-mono text-xs max-w-[200px]">
                      {e.userAgent ? (
                        <Link
                          href={`/details?type=userAgent&value=${encodeURIComponent(e.userAgent)}`}
                          className="text-amber-400 hover:text-amber-300 hover:underline block truncate max-w-[200px]"
                          title={e.userAgent}
                        >
                          {e.userAgent}
                        </Link>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">No entries found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-400 mt-4">
              <span>
                Showing {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, sortedEntries.length).toLocaleString()} of {sortedEntries.length.toLocaleString()}
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
