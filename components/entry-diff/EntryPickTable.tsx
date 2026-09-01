"use client";

import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { ContentTypeCell } from "@/components/shared/ContentTypeDisplay";
import { formatBytes } from "@/utils/harParser";
import {
  entryId,
  getContentDiffEntryBadge,
  noCapturedBodyHint,
} from "@/utils/contentDiff";
import type { EntryRecord } from "@/types/har";

interface EntryPickTableProps {
  entries: EntryRecord[];
  baselineId: string | null;
  compareId: string | null;
  onSelectBaseline: (id: string) => void;
  onSelectCompare: (id: string) => void;
}

function EntryPickRow({
  entry,
  isBaseline,
  isCompare,
  onSelectBaseline,
  onSelectCompare,
}: {
  entry: EntryRecord;
  isBaseline: boolean;
  isCompare: boolean;
  onSelectBaseline: () => void;
  onSelectCompare: () => void;
}) {
  const badge = getContentDiffEntryBadge(entry);
  const utc = entry.startedDateTime
    ? new Date(entry.startedDateTime).toLocaleString("en-US", {
        timeZone: "UTC",
      }) + " UTC"
    : "—";

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
        <span
          className="truncate block max-w-[180px]"
          title={entry.harFileName}
        >
          {entry.harFileName}
        </span>
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
      <td className="py-3 px-4 text-sm">
        <StatusBadge code={entry.status} />
      </td>
      <td className="py-3 px-4 text-sm">
        <ContentTypeCell entry={entry} />
      </td>
      <td className="py-3 px-4 text-sm font-mono text-slate-700 dark:text-slate-300 text-right text-xs">
        {formatBytes(entry.contentSize)}
      </td>
      <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400 text-right whitespace-nowrap">
        {entry.requestHeaders.length} / {entry.responseHeaders.length}
      </td>
      <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400 text-right whitespace-nowrap">
        {entry.requestCookies.length} / {entry.responseCookies.length}
      </td>
      <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
        {utc}
      </td>
      <td className="py-3 px-4 text-sm">
        {badge === "binary" && (
          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            binary
          </span>
        )}
        {badge === "no body" && (
          <span
            className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
            title={noCapturedBodyHint(entry)}
          >
            no body
          </span>
        )}
      </td>
    </tr>
  );
}

export function EntryPickTable({
  entries,
  baselineId,
  compareId,
  onSelectBaseline,
  onSelectCompare,
}: EntryPickTableProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
        Entries
        <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-500">
          {entries.length} total
        </span>
      </h2>

      {entries.length === 1 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Only one entry available — select at least two to diff
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[
                "Baseline",
                "Compare",
                "HAR File",
                "URL",
                "Status",
                "Content Type",
                "Size",
                "Req/Res Headers",
                "Req/Res Cookies",
                "Timestamp (UTC)",
                "Body",
              ].map((label, i) => (
                <th
                  key={label}
                  className={`py-3 px-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60 whitespace-nowrap ${
                    i < 2 ? "text-center" : i >= 6 && i <= 8 ? "text-right" : "text-left"
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const id = entryId(entry);
              return (
                <EntryPickRow
                  key={id}
                  entry={entry}
                  isBaseline={baselineId === id}
                  isCompare={compareId === id}
                  onSelectBaseline={() => onSelectBaseline(id)}
                  onSelectCompare={() => onSelectCompare(id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
