"use client";

import Link from "next/link";
import {
  type AnomalyCategory,
  type AnomaliesReport,
  categoryMeta,
  reportCategorySlice,
} from "@/utils/anomalies";

export function HubTitle({
  fileCount,
  report,
}: {
  fileCount: number;
  report: AnomaliesReport;
}) {
  const multiCategory = report.correlations.filter((c) => c.categories.length > 1)
    .length;
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Anomalies
      </h2>
      <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
        Same pathname behaving inconsistently across {fileCount} loaded HAR
        file{fileCount !== 1 ? "s" : ""} ·{" "}
        {report.uniquePathCount.toLocaleString()} path
        {report.uniquePathCount === 1 ? "" : "s"} with at least one anomaly
        {multiCategory > 0
          ? ` · ${multiCategory.toLocaleString()} with multiple check types`
          : ""}
        . Query strings are ignored for path matching.
      </p>
    </div>
  );
}

export function HubCards({ report }: { report: AnomaliesReport }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(
        [
          "status",
          "size",
          "encoding",
          "cache-policy",
        ] as const
      ).map((category) => {
        const meta = categoryMeta(category);
        const slice = reportCategorySlice(report, category);
        const count = slice.pathGroupCount;
        return (
          <Link
            key={category}
            href={meta.href}
            className={`rounded-xl border px-4 py-4 transition-colors ${
              count > 0
                ? "border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/15 hover:bg-amber-100/70 dark:hover:bg-amber-950/25"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {meta.shortTitle}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-500 mt-1">
                  {meta.description}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                  {count > 0
                    ? `${count.toLocaleString()} path group${count === 1 ? "" : "s"} · ${slice.entryCount.toLocaleString()} entr${slice.entryCount === 1 ? "y" : "ies"}`
                    : "No anomalies in scope"}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-medium ${
                  count > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {count > 0 ? "Review →" : "clear"}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function CorrelationStrip({ report }: { report: AnomaliesReport }) {
  const multi = report.correlations.filter((c) => c.categories.length > 1);
  if (multi.length === 0) return null;
  const top = multi.slice(0, 8);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-500 mb-2">
        Paths flagged by multiple checks
      </p>
      <ul className="space-y-1.5 text-sm">
        {top.map((row) => (
          <li
            key={row.pathname}
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <span className="font-mono text-xs text-slate-800 dark:text-slate-200">
              {row.pathname}
            </span>
            <span className="flex flex-wrap gap-1">
              {row.categories.map((cat) => (
                <Link
                  key={cat}
                  href={categoryMeta(cat).href}
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-950/40 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  {categoryMeta(cat).shortTitle}
                </Link>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {multi.length > top.length && (
        <p className="text-xs text-slate-500 mt-2">
          +{multi.length - top.length} more path
          {multi.length - top.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

export function RelatedTools() {
  return (
    <div className="text-xs text-slate-600 dark:text-slate-500">
      Related checks:{" "}
      <Link
        href="/mime-mismatch"
        className="text-blue-600 dark:text-blue-400 hover:underline"
      >
        MIME mismatch
      </Link>
      ·{" "}
      <Link
        href="/cache-validator"
        className="text-blue-600 dark:text-blue-400 hover:underline"
      >
        Cache validator
      </Link>
      ·{" "}
      <Link href="/cors" className="text-blue-600 dark:text-blue-400 hover:underline">
        CORS
      </Link>
    </div>
  );
}
