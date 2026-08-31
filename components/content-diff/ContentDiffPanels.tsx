"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatBytes } from "@/utils/harParser";
import {
  getContentDiffEntryBadge,
  noCapturedBodyHint,
  contentDiffFallbackMessage,
  hasCapturedResponseBody,
  isBinaryMimeType,
  sha256Hex,
  TRUNCATION_LIMIT,
} from "@/utils/contentDiff";
import type { EntryRecord } from "@/types/har";

interface EntryRowProps {
  entry: EntryRecord;
  isBaseline: boolean;
  isCompare: boolean;
  onSelectBaseline: () => void;
  onSelectCompare: () => void;
}

export function EntryRow({
  entry,
  isBaseline,
  isCompare,
  onSelectBaseline,
  onSelectCompare,
}: EntryRowProps) {
  const badge = getContentDiffEntryBadge(entry);
  const utc = entry.startedDateTime
    ? new Date(entry.startedDateTime).toLocaleString("en-US", {
        timeZone: "UTC",
      }) + " UTC"
    : "—";

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
        <span
          className="truncate block max-w-[180px]"
          title={entry.harFileName}
        >
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
        {entry.contentType || "—"}
      </td>
      {/* Size */}
      <td className="py-3 px-4 text-sm font-mono text-slate-700 dark:text-slate-300 text-right text-xs">
        {formatBytes(entry.contentSize)}
      </td>
      {/* Timestamp */}
      <td className="py-3 px-4 text-sm font-mono text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
        {utc}
      </td>
      {/* Body capture / binary badge */}
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

// ---------------------------------------------------------------------------
// Binary hash comparison
// ---------------------------------------------------------------------------

/**
 * Fallback panel shown when at least one of the selected entries has a
 * binary content type or no captured response body. Computes the SHA-256
 * hash of each side's stored response body (when present) and reports
 * whether they match, alongside byte sizes.
 */
export function BinaryHashCompare({
  baseline,
  compare,
  baselineBody,
  compareBody,
}: {
  baseline: EntryRecord;
  compare: EntryRecord;
  baselineBody?: string;
  compareBody?: string;
}) {
  const baseText =
    baselineBody !== undefined ? baselineBody : baseline.responseContent;
  const cmpText =
    compareBody !== undefined ? compareBody : compare.responseContent;
  const baseHasBody = hasCapturedResponseBody(baseline);
  const cmpHasBody = hasCapturedResponseBody(compare);
  const baseReady = baseText !== undefined;
  const cmpReady = cmpText !== undefined;

  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [cmpHash, setCmpHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBaseHash(null);
    setCmpHash(null);
    setError(null);

    (async () => {
      try {
        const tasks: Promise<unknown>[] = [];
        if (baseReady) {
          tasks.push(
            sha256Hex(baseText ?? "").then((h) => {
              if (!cancelled) setBaseHash(h);
            }),
          );
        }
        if (cmpReady) {
          tasks.push(
            sha256Hex(cmpText ?? "").then((h) => {
              if (!cancelled) setCmpHash(h);
            }),
          );
        }
        await Promise.all(tasks);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseText, cmpText, baseReady, cmpReady]);

  const bothHaveBody = baseHasBody && cmpHasBody;
  const bothLoaded = baseReady && cmpReady;
  const ready = baseHash !== null && cmpHash !== null;
  const identical = bothLoaded && ready && baseHash === cmpHash;
  const different = bothLoaded && ready && baseHash !== cmpHash;

  const missingLabel =
    !baseHasBody && !cmpHasBody
      ? "either entry"
      : !baseHasBody
        ? "baseline"
        : "compare";

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {contentDiffFallbackMessage(baseline, compare)}
        </p>
        {error ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50">
            Hash error: {error}
          </span>
        ) : !bothHaveBody ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
            No body captured for {missingLabel}
          </span>
        ) : !bothLoaded ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            Loading bodies…
          </span>
        ) : !ready ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            Computing SHA-256…
          </span>
        ) : identical ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50">
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            Identical (matching SHA-256)
          </span>
        ) : different ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50">
            Different (SHA-256 mismatch)
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          {
            label: "Baseline",
            entry: baseline,
            hash: baseHash,
            hasBody: baseHasBody,
          },
          {
            label: "Compare",
            entry: compare,
            hash: cmpHash,
            hasBody: cmpHasBody,
          },
        ].map(({ label, entry, hash, hasBody }) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-5 py-4 space-y-2"
          >
            <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wider">
              {label}
            </p>
            <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
              {formatBytes(entry.contentSize)}
            </p>
            <p
              className="text-xs font-mono text-slate-500 dark:text-slate-500 truncate"
              title={entry.harFileName}
            >
              {entry.harFileName}
            </p>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 mb-1">
                SHA-256
              </p>
              {!hasBody ? (
                <p className="text-xs font-mono italic text-slate-500 dark:text-slate-500">
                  no response body captured
                </p>
              ) : hash === null ? (
                <p className="text-xs font-mono italic text-slate-500 dark:text-slate-500">
                  computing…
                </p>
              ) : (
                <p
                  className="text-xs font-mono break-all text-slate-700 dark:text-slate-300"
                  title={hash}
                >
                  {hash}
                </p>
              )}
            </div>
          </div>
        ))}
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

export function TruncationNotice({
  fullLength,
  showFull,
  onToggle,
  label,
}: TruncationNoticeProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs">
      <span className="text-amber-700 dark:text-amber-400">
        <strong>{label}</strong> truncated at{" "}
        {TRUNCATION_LIMIT.toLocaleString()} of {fullLength.toLocaleString()}{" "}
        characters
      </span>
      <button
        onClick={onToggle}
        className="ml-4 text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 underline underline-offset-2 shrink-0"
      >
        {showFull ? "Show less" : "Show full content"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
