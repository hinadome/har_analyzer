"use client";

import { useState, useMemo, Fragment } from "react";
import Link from "next/link";
import { HarAnalysis, EntryRecord, HarHeader } from "@/types/har";
import { formatBytes, formatTime } from "@/utils/harParser";
import StatusBadge from "@/components/StatusBadge";
import { ContentTypeCell } from "@/components/shared/ContentTypeDisplay";
import { statusColorClass } from "@/components/StatusBadge";
import { TIMING_PHASES } from "@/components/timingPhases";
import { useEntryBody } from "@/hooks/useEntryBody";

export type SortField =
  | "harFileName"
  | "status"
  | "contentType"
  | "startedDateTime"
  | "contentSize"
  | "time"
  | "serverIPAddress"
  | "userAgent";

export function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span
      className={`ml-1 ${active ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-600"}`}
    >
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

function HeaderTable({ headers }: { headers: HarHeader[] }) {
  if (!headers.length)
    return (
      <p className="text-slate-600 dark:text-slate-600 text-xs italic">None</p>
    );
  return (
    <table className="w-full text-xs border-collapse">
      <tbody>
        {headers.map((h, i) => (
          <tr
            key={i}
            className="border-t border-slate-200 dark:border-slate-700/30"
          >
            <td className="py-0.5 pr-3 font-semibold text-slate-600 dark:text-slate-400 font-mono w-1/3 align-top break-all">
              {h.name}
            </td>
            <td className="py-0.5 text-slate-700 dark:text-slate-300 font-mono break-all">
              {h.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CookieTable({
  cookies,
}: {
  cookies: Array<{ name: string; value: string }>;
}) {
  if (!cookies.length)
    return (
      <p className="text-slate-600 dark:text-slate-600 text-xs italic">None</p>
    );
  return (
    <table className="w-full text-xs border-collapse">
      <tbody>
        {cookies.map((c, i) => (
          <tr
            key={i}
            className="border-t border-slate-200 dark:border-slate-700/30"
          >
            <td className="py-0.5 pr-3 font-semibold text-slate-600 dark:text-slate-400 font-mono w-1/3 align-top break-all">
              {c.name}
            </td>
            <td className="py-0.5 text-slate-700 dark:text-slate-300 font-mono break-all">
              {c.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EntryDetail({ entry }: { entry: EntryRecord }) {
  const [tab, setTab] = useState<"req" | "res" | "timing" | "content">("req");
  const tabBase = "px-3 py-1.5 text-xs font-medium rounded transition-colors";
  const tabActive = `${tabBase} bg-slate-700 text-slate-900 dark:text-slate-100`;
  const tabInactive = `${tabBase} text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300`;

  const reqHeaders = entry.requestHeaders ?? [];
  const resHeaders = entry.responseHeaders ?? [];
  const reqCookies = entry.requestCookies ?? [];
  const resCookies = entry.responseCookies ?? [];

  const timings = entry.timings;
  const timingTotal = TIMING_PHASES.reduce((sum, { key }) => {
    const val = timings[key] ?? -1;
    return sum + (val > 0 ? val : 0);
  }, 0);

  return (
    <div className="mt-2 border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/50">
        <StatusBadge code={entry.status} />
        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
          {entry.method}
        </span>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-500 ml-auto">
          {formatBytes(entry.contentSize)} · {formatTime(entry.time)}
        </span>
      </div>
      <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900/40">
        <div className="flex gap-1 mb-3">
          <button
            className={tab === "req" ? tabActive : tabInactive}
            onClick={() => setTab("req")}
          >
            Request
            {reqCookies.length > 0 && (
              <span className="ml-1.5 text-xs bg-slate-600 text-slate-700 dark:text-slate-300 rounded px-1">
                {reqCookies.length} cookies
              </span>
            )}
          </button>
          <button
            className={tab === "res" ? tabActive : tabInactive}
            onClick={() => setTab("res")}
          >
            Response
            {resCookies.length > 0 && (
              <span className="ml-1.5 text-xs bg-slate-600 text-slate-700 dark:text-slate-300 rounded px-1">
                {resCookies.length} cookies
              </span>
            )}
          </button>
          <button
            className={tab === "timing" ? tabActive : tabInactive}
            onClick={() => setTab("timing")}
          >
            Timing
          </button>
          <button
            className={tab === "content" ? tabActive : tabInactive}
            onClick={() => setTab("content")}
          >
            Content
          </button>
        </div>
        {tab === "req" && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider mb-1">
                Headers ({reqHeaders.length})
              </p>
              <HeaderTable headers={reqHeaders} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider mb-1">
                Cookies ({reqCookies.length})
              </p>
              <CookieTable cookies={reqCookies} />
            </div>
          </div>
        )}
        {tab === "res" && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider mb-1">
                Headers ({resHeaders.length})
              </p>
              <HeaderTable headers={resHeaders} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider mb-1">
                Cookies ({resCookies.length})
              </p>
              <CookieTable cookies={resCookies} />
            </div>
          </div>
        )}
        {tab === "timing" && (
          <div className="space-y-3">
            {timingTotal <= 0 ? (
              <p className="text-slate-600 dark:text-slate-600 text-xs italic">
                No timing data available
              </p>
            ) : (
              <>
                <div className="flex h-4 rounded overflow-hidden gap-px">
                  {TIMING_PHASES.map(({ key, label, bar }) => {
                    const val = timings[key] ?? -1;
                    const ms = val > 0 ? val : 0;
                    const pct = (ms / timingTotal) * 100;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={key}
                        className={`${bar} transition-all`}
                        style={{ width: `${pct}%` }}
                        title={`${label}: ${formatTime(ms)} (${pct.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {TIMING_PHASES.map(({ key, label, text, dot }) => {
                    const val = timings[key] ?? -1;
                    const ms = val > 0 ? val : 0;
                    const pct = (ms / timingTotal) * 100;
                    return (
                      <div key={key} className="flex items-start gap-1.5">
                        <span
                          className={`mt-0.5 w-2 h-2 rounded-sm shrink-0 ${dot}`}
                        />
                        <div>
                          <p className="text-xs text-slate-600 dark:text-slate-500">
                            {label}
                          </p>
                          <p
                            className={`text-xs font-mono font-semibold ${text}`}
                          >
                            {formatTime(ms)}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-600">
                            {pct.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-600">
                  TTFB = server think time (wait phase). Phases &lt;0.5% hidden
                  from bar.
                </p>
              </>
            )}
          </div>
        )}
        {tab === "content" && <ContentTab entry={entry} />}
      </div>
    </div>
  );
}

function ContentTab({ entry }: { entry: EntryRecord }) {
  const { body, loading } = useEntryBody(entry);
  if (loading) {
    return (
      <p className="text-slate-600 dark:text-slate-600 text-xs italic">
        Loading response body…
      </p>
    );
  }
  if (body === undefined || body === "") {
    return (
      <p className="text-slate-600 dark:text-slate-600 text-xs italic">
        No content available
      </p>
    );
  }
  return (
    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-3 max-h-96 overflow-y-auto">
      <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
        {body}
      </pre>
    </div>
  );
}

export interface FileSummaryRow {
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

export function PerFileRow({ row }: { row: FileSummaryRow }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedEntryIdx, setExpandedEntryIdx] = useState<number | null>(null);
  const {
    analysis,
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
  } = row;
  const entryIndexMap = useMemo(() => {
    const map = new Map<EntryRecord, number>();
    analysis.entries.forEach((e, i) => map.set(e, i));
    return map;
  }, [analysis]);

  return (
    <Fragment key={analysis.fileIndex}>
      <tr className="border-t border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:bg-slate-800/40 transition-colors">
        {/* Expand toggle */}
        <td className="py-3 px-4 text-sm w-8">
          {hits > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-600 dark:text-slate-500 hover:text-slate-800 dark:text-slate-200 transition-colors"
              title={expanded ? "Collapse" : "Expand requests"}
            >
              <span className="text-xs">{expanded ? "▼" : "▶"}</span>
            </button>
          )}
        </td>
        <td className="py-3 px-4 text-sm">
          <Link
            href={`/file/${analysis.fileIndex}`}
            className="text-slate-800 dark:text-slate-200 hover:text-blue-700 dark:text-blue-300 hover:underline font-mono text-xs truncate max-w-[200px] block"
            title={analysis.fileName}
          >
            {analysis.fileName}
          </Link>
        </td>
        <td className="py-3 px-4 text-sm text-right font-mono">
          {hits > 0 ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-800 dark:text-slate-200 font-semibold hover:text-blue-700 dark:text-blue-300 transition-colors"
            >
              {hits}
            </button>
          ) : (
            <span className="text-slate-600 dark:text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm">
          {hits > 0 ? (
            <div className="flex flex-wrap gap-1">
              {statuses.map((code) => (
                <Link key={code} href={`/details?type=status&value=${code}`}>
                  <span
                    className={`font-mono text-xs font-semibold ${statusColorClass(code)}`}
                  >
                    {code}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <span className="text-slate-600 dark:text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm">
          {hits > 0 ? (
            <div className="flex flex-wrap gap-1">
              {contentTypes.map((ct) => (
                <Link
                  key={ct}
                  href={`/details?type=contentType&value=${encodeURIComponent(ct)}`}
                  className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:text-purple-300 hover:underline font-mono text-xs"
                >
                  {ct}
                </Link>
              ))}
            </div>
          ) : (
            <span className="text-slate-600 dark:text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-right font-mono text-slate-700 dark:text-slate-300">
          {hits > 0 ? (
            formatBytes(avgSize)
          ) : (
            <span className="text-slate-600 dark:text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-right font-mono text-slate-700 dark:text-slate-300">
          {hits > 0 ? (
            formatTime(avgTime)
          ) : (
            <span className="text-slate-600 dark:text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-right font-mono text-slate-600 dark:text-slate-400 text-xs">
          {hits > 0 ? (
            <span>
              {formatTime(minTime)} / {formatTime(maxTime)}
            </span>
          ) : (
            <span className="text-slate-600 dark:text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm font-mono text-xs text-slate-700 dark:text-slate-300">
          {hits > 0 && serverIPs.length > 0 ? (
            <div className="space-y-0.5">
              {serverIPs.map((ip) => (
                <div key={ip}>
                  <Link
                    href={`/details?type=serverIPAddress&value=${encodeURIComponent(ip)}`}
                    className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:text-cyan-300 hover:underline"
                  >
                    {ip}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-slate-600 dark:text-slate-600">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm font-mono text-xs text-slate-700 dark:text-slate-300 max-w-[200px]">
          {hits > 0 && userAgents.length > 0 ? (
            <div className="space-y-0.5">
              {userAgents.map((ua, i) => (
                <div key={i} className="truncate max-w-[200px]" title={ua}>
                  <Link
                    href={`/details?type=userAgent&value=${encodeURIComponent(ua)}`}
                    className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:text-amber-300 hover:underline"
                  >
                    {ua}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-slate-600 dark:text-slate-600">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-200 dark:border-slate-700/30">
          <td colSpan={10} className="p-0">
            <div className="bg-slate-100 dark:bg-slate-900/60 border-l-2 border-blue-500/40 px-6 py-4 space-y-3">
              {entries.map((entry, idx) => (
                <div key={idx} className="space-y-1">
                  {/* Request summary header — clickable to expand headers/cookies */}
                  <button
                    className="w-full text-left flex items-center gap-3 group"
                    onClick={() =>
                      setExpandedEntryIdx(expandedEntryIdx === idx ? null : idx)
                    }
                  >
                    <span className="text-slate-600 dark:text-slate-500 text-xs group-hover:text-slate-700 dark:text-slate-300 transition-colors">
                      {expandedEntryIdx === idx ? "▼" : "▶"}
                    </span>
                    <span
                      className="text-xs font-mono text-slate-500 dark:text-slate-400 min-w-20"
                      title={entry.startedDateTime}
                    >
                      {new Date(entry.startedDateTime).toLocaleString("en-US", {
                        timeZone: "UTC",
                      })}{" "}
                      GMT
                    </span>
                    <StatusBadge code={entry.status} />
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                      {entry.method}
                    </span>
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-500">
                      {formatBytes(entry.contentSize)}
                    </span>
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-500">
                      {formatTime(entry.time)}
                    </span>
                    <Link
                      href={`/details?type=contentType&value=${encodeURIComponent(entry.contentType)}`}
                      className="ml-auto hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ContentTypeCell entry={entry} />
                    </Link>
                    <Link
                      href={`/entry/${analysis.fileIndex}/${entryIndexMap.get(entry) ?? 0}`}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-300 font-mono text-xs"
                      onClick={(e) => e.stopPropagation()}
                      title="Open entry detail"
                    >
                      Detail →
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

