import Link from "next/link";
import { formatBytes } from "@/utils/harParser";
import { deltaTone, formatDelta, formatPctChange } from "@/utils/perfFormat";
import type { HomeInsights } from "@/utils/homeInsights";
import {
  corsInsightSubtitle,
  corsInsightTitle,
  corsInsightTone,
  shouldShowCorsInsight,
} from "@/utils/homeInsights";

function formatCount(n: number): string {
  return n.toLocaleString();
}

interface InsightStripProps {
  insights: HomeInsights;
}

export function InsightStrip({ insights }: InsightStripProps) {
  const single = insights.files.length === 1 ? insights.files[0] : null;
  const pair = insights.pair;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            What to look at
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-500 mt-0.5">
            Quick read from file totals — open a tool below for the deep dive.
          </p>
        </div>
        {single ? (
          <Link
            href={`/file/${single.fileIndex}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium transition-colors"
          >
            Open file performance
            <span aria-hidden>→</span>
          </Link>
        ) : pair ? (
          <Link
            href={`/performance/diff?base=${pair.baseIndex}&cmp=${pair.cmpIndex}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium transition-colors"
          >
            Compare two runs
            <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Requests"
          value={formatCount(insights.totalRequests)}
        />
        <StatCard
          label="Errors (4xx/5xx/0)"
          value={formatCount(insights.totalErrors)}
          tone={
            insights.totalErrors > 0
              ? "text-red-600 dark:text-red-400"
              : undefined
          }
        />
        <StatCard
          label="Total size"
          value={formatBytes(insights.totalContentSize)}
        />
        <StatCard
          label="Files"
          value={formatCount(insights.files.length)}
        />
      </div>

      {pair && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Headline Δ ·{" "}
              <span className="font-mono text-xs">{pair.baseName}</span>
              <span className="text-slate-500 mx-1.5">→</span>
              <span className="font-mono text-xs">{pair.cmpName}</span>
            </p>
            <Link
              href={`/performance/diff?base=${pair.baseIndex}&cmp=${pair.cmpIndex}`}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Full pair diff →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DeltaCard
              label="Requests"
              base={insights.files[0].totalRequests}
              delta={pair.deltaRequests}
              format={formatCount}
              direction="neutral"
            />
            <DeltaCard
              label="Errors"
              base={insights.files[0].errorCount}
              delta={pair.deltaErrors}
              format={formatCount}
              direction="lower"
            />
            <DeltaCard
              label="Size"
              base={insights.files[0].totalContentSize}
              delta={pair.deltaBytes}
              format={formatBytes}
              direction="neutral"
            />
          </div>
        </div>
      )}

      {insights.cors && shouldShowCorsInsight(insights.cors) && (
        <CorsInsightCard cors={insights.cors} />
      )}

      {insights.mimeMismatch &&
        insights.mimeMismatch.mismatchCount > 0 && (
          <MimeMismatchInsightCard mime={insights.mimeMismatch} />
        )}

      {insights.cacheValidator &&
        insights.cacheValidator.pathConflictCount > 0 && (
          <CacheValidatorInsightCard cache={insights.cacheValidator} />
        )}

      {insights.anomalies && insights.anomalies.uniquePathCount > 0 && (
        <AnomaliesInsightCard anomalies={insights.anomalies} />
      )}

      {single && (
        <p className="text-sm text-slate-600 dark:text-slate-500">
          <Link
            href={`/file/${single.fileIndex}`}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {single.uniqueUrlCount.toLocaleString()} unique URLs
          </Link>
          {single.errorCount > 0 && (
            <>
              {" "}
              ·{" "}
              <span className="text-red-600 dark:text-red-400">
                {single.errorCount.toLocaleString()} error response
                {single.errorCount === 1 ? "" : "s"}
              </span>
            </>
          )}
        </p>
      )}
    </section>
  );
}

function MimeMismatchInsightCard({
  mime,
}: {
  mime: NonNullable<HomeInsights["mimeMismatch"]>;
}) {
  return (
    <Link
      href="/mime-mismatch"
      className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/15 px-4 py-3 transition-colors hover:bg-amber-100/70 dark:hover:bg-amber-950/25"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          {mime.mismatchCount.toLocaleString()} Content-Type / extension mismatch
          {mime.mismatchCount === 1 ? "" : "es"}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-500 mt-0.5">
          URL extension does not match response Content-Type
          {mime.unverifiedCount > 0
            ? ` · ${mime.unverifiedCount.toLocaleString()} unverified extension${mime.unverifiedCount === 1 ? "" : "s"} (hidden by default)`
            : ""}
        </p>
      </div>
      <span className="text-sm font-medium shrink-0 text-amber-700 dark:text-amber-400">
        Review →
      </span>
    </Link>
  );
}

function CacheValidatorInsightCard({
  cache,
}: {
  cache: NonNullable<HomeInsights["cacheValidator"]>;
}) {
  return (
    <Link
      href="/cache-validator"
      className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/15 px-4 py-3 transition-colors hover:bg-amber-100/70 dark:hover:bg-amber-950/25"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          {cache.pathConflictCount.toLocaleString()} path
          {cache.pathConflictCount === 1 ? "" : "s"} with cache validator drift
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-500 mt-0.5">
          Same pathname with different ETag or Last-Modified (
          {cache.entryCount.toLocaleString()} entr
          {cache.entryCount === 1 ? "y" : "ies"} involved)
        </p>
      </div>
      <span className="text-sm font-medium shrink-0 text-amber-700 dark:text-amber-400">
        Review →
      </span>
    </Link>
  );
}

function AnomaliesInsightCard({
  anomalies,
}: {
  anomalies: NonNullable<HomeInsights["anomalies"]>;
}) {
  const parts: string[] = [];
  if (anomalies.statusCount > 0) {
    parts.push(`${anomalies.statusCount} status`);
  }
  if (anomalies.sizeCount > 0) {
    parts.push(`${anomalies.sizeCount} size`);
  }
  if (anomalies.encodingCount > 0) {
    parts.push(`${anomalies.encodingCount} encoding`);
  }
  if (anomalies.cachePolicyCount > 0) {
    parts.push(`${anomalies.cachePolicyCount} cache policy`);
  }
  const breakdown =
    parts.length > 0 ? parts.join(" · ") : "mixed pathname signals";

  return (
    <Link
      href="/anomalies"
      className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/15 px-4 py-3 transition-colors hover:bg-amber-100/70 dark:hover:bg-amber-950/25"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          {anomalies.uniquePathCount.toLocaleString()} path
          {anomalies.uniquePathCount === 1 ? "" : "s"} with anomalies
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-500 mt-0.5">
          {breakdown} — status, size, encoding, or cache headers on the same path
        </p>
      </div>
      <span className="text-sm font-medium shrink-0 text-amber-700 dark:text-amber-400">
        Review →
      </span>
    </Link>
  );
}

function CorsInsightCard({
  cors,
}: {
  cors: NonNullable<HomeInsights["cors"]>;
}) {
  const tone = corsInsightTone(cors);
  return (
    <Link
      href="/cors"
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
        tone === "error"
          ? "border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/20 hover:bg-red-100/80 dark:hover:bg-red-950/30"
          : tone === "warning"
            ? "border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/15 hover:bg-amber-100/70 dark:hover:bg-amber-950/25"
            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
      }`}
    >
      <div className="min-w-0">
        <p
          className={`text-sm font-semibold ${
            tone === "error"
              ? "text-red-700 dark:text-red-300"
              : tone === "warning"
                ? "text-amber-800 dark:text-amber-300"
                : "text-slate-800 dark:text-slate-200"
          }`}
        >
          {corsInsightTitle(cors)}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-500 mt-0.5">
          {corsInsightSubtitle(cors)}
        </p>
      </div>
      <span
        className={`text-sm font-medium shrink-0 ${
          tone === "error"
            ? "text-red-600 dark:text-red-400"
            : tone === "warning"
              ? "text-amber-700 dark:text-amber-400"
              : "text-slate-600 dark:text-slate-400"
        }`}
      >
        Open →
      </span>
    </Link>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold font-mono tabular-nums ${tone ?? "text-slate-900 dark:text-slate-100"}`}
      >
        {value}
      </p>
    </div>
  );
}

function DeltaCard({
  label,
  base,
  delta,
  format,
  direction,
}: {
  label: string;
  base: number;
  delta: number;
  format: (n: number) => string;
  direction: "lower" | "neutral";
}) {
  const tone = deltaTone(delta, direction);
  return (
    <div className="rounded-lg bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 px-3 py-2.5">
      <p className="text-xs text-slate-500 dark:text-slate-500">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold ${tone}`}>
        {formatDelta(delta, format)}
        <span className="ml-2 font-normal text-slate-500 dark:text-slate-500">
          ({formatPctChange(base, base + delta)})
        </span>
      </p>
    </div>
  );
}
