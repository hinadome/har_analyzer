"use client";

import { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { useHarStore } from "@/hooks/useHarStore";
import { formatBytes, formatTime } from "@/utils/harParser";
import StatusBadge from "@/components/StatusBadge";
import {
  PerFileRow,
  SortIcon,
  type FileSummaryRow,
  type SortField,
} from "@/components/compare/ComparePanels";

export default function ComparePage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <ComparePageContent />
    </Suspense>
  );
}

function ComparePageContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";

  const { store, isLoading } = useHarStore();
  const analyses = store?.analyses ?? [];
  const allEntries = useMemo(
    () => store?.analyses.flatMap((a) => a.entries) ?? [],
    [store],
  );

  const [sortField, setSortField] = useState<SortField>("harFileName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const urlEntries = useMemo(
    () => allEntries.filter((e) => e.url === url),
    [allEntries, url],
  );

  const perFileSummary = useMemo<FileSummaryRow[]>(() => {
    return analyses.map((a) => {
      const entries = urlEntries.filter((e) => e.harFileIndex === a.fileIndex);
      const hits = entries.length;
      const statuses = [...new Set(entries.map((e) => e.status))].sort();
      const contentTypes = [...new Set(entries.map((e) => e.contentType))];
      const avgSize =
        hits > 0 ? entries.reduce((s, e) => s + e.contentSize, 0) / hits : 0;
      const avgTime =
        hits > 0 ? entries.reduce((s, e) => s + e.time, 0) / hits : 0;
      const minTime = hits > 0 ? Math.min(...entries.map((e) => e.time)) : 0;
      const maxTime = hits > 0 ? Math.max(...entries.map((e) => e.time)) : 0;
      const serverIPs = [
        ...new Set(entries.map((e) => e.serverIPAddress ?? "").filter(Boolean)),
      ];
      const userAgents = [
        ...new Set(entries.map((e) => e.userAgent ?? "").filter(Boolean)),
      ];
      return {
        analysis: a,
        hits,
        statuses,
        contentTypes,
        avgSize,
        avgTime,
        minTime,
        maxTime,
        serverIPs,
        userAgents,
        entries,
      };
    });
  }, [analyses, urlEntries]);

  const sortedEntries = useMemo(() => {
    return [...urlEntries].sort((a, b) => {
      let cmp = 0;
      if (sortField === "harFileName")
        cmp = a.harFileName.localeCompare(b.harFileName);
      else if (sortField === "status") cmp = a.status - b.status;
      else if (sortField === "contentType")
        cmp = a.contentType.localeCompare(b.contentType);
      else if (sortField === "startedDateTime")
        cmp = a.startedDateTime.localeCompare(b.startedDateTime);
      else if (sortField === "contentSize") cmp = a.contentSize - b.contentSize;
      else if (sortField === "time") cmp = a.time - b.time;
      else if (sortField === "serverIPAddress")
        cmp = (a.serverIPAddress ?? "").localeCompare(b.serverIPAddress ?? "");
      else if (sortField === "userAgent")
        cmp = (a.userAgent ?? "").localeCompare(b.userAgent ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [urlEntries, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / pageSize));
  const paginated = sortedEntries.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  const thClass =
    "py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 cursor-pointer select-none hover:text-slate-800 dark:text-slate-200 transition-colors";

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  if (!url) {
    return (
      <PageShell back={{ href: "/details?type=url", label: "All URLs" }} crumb="Compare">
        <EmptyState
          title="No URL specified."
          action={
            <Link href="/details?type=url" className="text-blue-600 dark:text-blue-400 hover:underline">
              ← Back to All URLs
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (!allEntries.length) {
    return (
      <PageShell back={{ href: "/details?type=url", label: "All URLs" }} crumb="Compare">
        <EmptyState title="No HAR data loaded." />
      </PageShell>
    );
  }

  if (urlEntries.length === 0) {
    return (
      <PageShell back={{ href: "/details?type=url", label: "All URLs" }} crumb="Compare">
        <EmptyState
          title="URL not found in loaded HAR files."
          action={
            <Link href="/details?type=url" className="text-blue-600 dark:text-blue-400 hover:underline">
              ← Back to All URLs
            </Link>
          }
        />
      </PageShell>
    );
  }

  const totalHits = urlEntries.length;
  const filesWithUrl = perFileSummary.filter((r) => r.hits > 0).length;
  const overallAvgTime = urlEntries.reduce((s, e) => s + e.time, 0) / totalHits;
  const overallAvgSize =
    urlEntries.reduce((s, e) => s + e.contentSize, 0) / totalHits;
  const uniqueServerIPs = [
    ...new Set(urlEntries.map((e) => e.serverIPAddress).filter(Boolean)),
  ];

  return (
    <PageShell
      back={{ href: "/details?type=url", label: "All URLs" }}
      crumb="Compare"
    >
        {/* URL Title */}
        <div>
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-400">
              URL Comparison
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/content-diff?url=${encodeURIComponent(url)}`}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
                Content Diff
              </Link>
              <Link
                href={`/header-diff?url=${encodeURIComponent(url)}`}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-400 dark:hover:border-purple-600 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 10h16M4 14h10M4 18h6"
                  />
                </svg>
                Header Diff
              </Link>
            </div>
          </div>
          <p className="text-slate-900 dark:text-slate-100 font-mono text-sm break-all bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-blue-700 dark:text-blue-300"
            >
              {url}
            </a>
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: "Total Hits", value: totalHits.toLocaleString() },
            {
              label: "Files with URL",
              value: `${filesWithUrl} / ${analyses.length}`,
            },
            { label: "Avg Time", value: formatTime(overallAvgTime) },
            { label: "Avg Size", value: formatBytes(overallAvgSize) },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4"
            >
              <p className="text-xs text-slate-600 dark:text-slate-500 uppercase tracking-wider mb-1">
                {label}
              </p>
              <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {value}
              </p>
            </div>
          ))}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4">
            <p className="text-xs text-slate-600 dark:text-slate-500 uppercase tracking-wider mb-1">
              Server IPs
            </p>
            <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {uniqueServerIPs.length}
            </p>
            {uniqueServerIPs.length > 0 && uniqueServerIPs.length <= 3 && (
              <div className="mt-1.5 space-y-0.5">
                {uniqueServerIPs.map((ip) => (
                  <Link
                    key={ip}
                    href={`/details?type=serverIPAddress&value=${encodeURIComponent(ip)}`}
                    className="block text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:text-cyan-300 hover:underline truncate"
                    title={ip}
                  >
                    {ip}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Per-file comparison table */}
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
            Per-File Comparison
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-500 mb-3">
            Click the arrow or hit count to expand requests. Click a request to
            view headers and cookies.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-900/60 w-8" />
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                    HAR File
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                    Hits
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                    Status Codes
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                    Content Types
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                    Avg Size
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                    Avg Time
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                    Min / Max Time
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                    Server IP
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                    User Agent
                  </th>
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
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
            All Entries
            <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-500">
              {urlEntries.length.toLocaleString()} total
            </span>
          </h3>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("harFileName")}
                  >
                    HAR File{" "}
                    <SortIcon
                      active={sortField === "harFileName"}
                      dir={sortDir}
                    />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("startedDateTime")}
                  >
                    Start Time{" "}
                    <SortIcon
                      active={sortField === "startedDateTime"}
                      dir={sortDir}
                    />
                  </th>
                  <th className={thClass} onClick={() => toggleSort("status")}>
                    Status{" "}
                    <SortIcon active={sortField === "status"} dir={sortDir} />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("contentType")}
                  >
                    Content Type{" "}
                    <SortIcon
                      active={sortField === "contentType"}
                      dir={sortDir}
                    />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("contentSize")}
                  >
                    Size{" "}
                    <SortIcon
                      active={sortField === "contentSize"}
                      dir={sortDir}
                    />
                  </th>
                  <th className={thClass} onClick={() => toggleSort("time")}>
                    Time{" "}
                    <SortIcon active={sortField === "time"} dir={sortDir} />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("serverIPAddress")}
                  >
                    Server IP{" "}
                    <SortIcon
                      active={sortField === "serverIPAddress"}
                      dir={sortDir}
                    />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("userAgent")}
                  >
                    User Agent{" "}
                    <SortIcon
                      active={sortField === "userAgent"}
                      dir={sortDir}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((e, i) => (
                  <tr
                    key={i}
                    className="hover:bg-slate-50 dark:bg-slate-800/50 transition-colors border-t border-slate-200 dark:border-slate-700/50"
                  >
                    <td className="py-2.5 px-4 text-sm">
                      <Link
                        href={`/file/${e.harFileIndex}`}
                        className="text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:text-blue-300 hover:underline font-mono text-xs truncate max-w-[180px] block"
                        title={e.harFileName}
                      >
                        {e.harFileName}
                      </Link>
                    </td>
                    <td
                      className="py-2.5 px-4 text-sm font-mono text-slate-700 dark:text-slate-300"
                      title={e.startedDateTime}
                    >
                      {new Date(e.startedDateTime).toLocaleString("en-US", {
                        timeZone: "UTC",
                      })}{" "}
                      GMT
                    </td>
                    <td className="py-2.5 px-4 text-sm">
                      <Link href={`/details?type=status&value=${e.status}`}>
                        <StatusBadge code={e.status} />
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 text-sm">
                      <Link
                        href={`/details?type=contentType&value=${encodeURIComponent(e.contentType)}`}
                        className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:text-purple-300 hover:underline font-mono text-xs"
                      >
                        {e.contentType}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 text-sm font-mono text-slate-700 dark:text-slate-300 text-right">
                      {formatBytes(e.contentSize)}
                    </td>
                    <td className="py-2.5 px-4 text-sm font-mono text-slate-700 dark:text-slate-300 text-right">
                      {formatTime(e.time)}
                    </td>
                    <td className="py-2.5 px-4 text-sm font-mono text-xs">
                      {e.serverIPAddress ? (
                        <Link
                          href={`/details?type=serverIPAddress&value=${encodeURIComponent(e.serverIPAddress)}`}
                          className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:text-cyan-300 hover:underline"
                        >
                          {e.serverIPAddress}
                        </Link>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-600">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-sm font-mono text-xs max-w-[200px]">
                      {e.userAgent ? (
                        <Link
                          href={`/details?type=userAgent&value=${encodeURIComponent(e.userAgent)}`}
                          className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:text-amber-300 hover:underline block truncate max-w-[200px]"
                          title={e.userAgent}
                        >
                          {e.userAgent}
                        </Link>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-600">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-slate-600 dark:text-slate-500"
                    >
                      No entries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 mt-4">
              <span>
                Showing {((page - 1) * pageSize + 1).toLocaleString()}–
                {Math.min(
                  page * pageSize,
                  sortedEntries.length,
                ).toLocaleString()}{" "}
                of {sortedEntries.length.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
    </PageShell>
  );
}
