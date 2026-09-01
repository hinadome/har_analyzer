"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import ComparisonTable from "@/components/ComparisonTable";
import { PageShell } from "@/components/shell/PageShell";
import { LoadingState } from "@/components/shell/LoadingState";
import { InsightStrip } from "@/components/home/InsightStrip";
import { HarAnalysis } from "@/types/har";
import { buildHarStore } from "@/utils/harParser";
import { parseAndAnalyzeHarFile } from "@/utils/parseHar";
import {
  saveHarStoreAsync,
  clearHarStoreAsync,
  deleteBodiesAsync,
  collectBodyIds,
} from "@/utils/storage";
import { useHarStore, updateHarStoreCache } from "@/hooks/useHarStore";
import { analyzeStore as analyzeCorsStore } from "@/utils/corsAnalysis";
import { analyzeStore as analyzeMimeMismatchStore } from "@/utils/mimeMismatch";
import { analyzeStore as analyzeCacheValidatorStore } from "@/utils/cacheValidator";
import { computeHomeInsights } from "@/utils/homeInsights";
import {
  isRedactSecretsEnabled,
  redactAnalysis,
} from "@/utils/privacy";
import { PrivacyBanner } from "@/components/home/PrivacyBanner";
import { RedactSecretsToggle } from "@/components/home/RedactSecretsToggle";

const toolLinkClass =
  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500/50 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-sm font-medium transition-colors";

export default function HomePage() {
  const { analyses, isLoading: isStoreLoading } = useHarStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseProgress, setParseProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);

  const isLoading = isStoreLoading || isProcessing;

  const corsReport = useMemo(
    () => (analyses.length > 0 ? analyzeCorsStore(analyses) : null),
    [analyses],
  );

  const mimeReport = useMemo(
    () => (analyses.length > 0 ? analyzeMimeMismatchStore(analyses) : null),
    [analyses],
  );

  const cacheReport = useMemo(
    () => (analyses.length > 0 ? analyzeCacheValidatorStore(analyses) : null),
    [analyses],
  );

  const insights = useMemo(
    () =>
      analyses.length > 0
        ? computeHomeInsights(analyses, corsReport, mimeReport, cacheReport)
        : null,
    [analyses, corsReport, mimeReport, cacheReport],
  );

  const handleFilesSelected = async (files: File[]) => {
    setIsProcessing(true);
    setError(null);
    try {
      const startIndex = analyses.length;
      const newAnalyses: HarAnalysis[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setParseProgress(
          `Parsing ${i + 1} of ${files.length}: ${file.name}` +
            (file.size >= 1024 * 1024
              ? ` (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
              : ""),
        );
        // Yield so the progress line can paint before a heavy sync parse.
        await new Promise<void>((r) => setTimeout(r, 0));
        let analysis = await parseAndAnalyzeHarFile(file, startIndex + i);
        if (isRedactSecretsEnabled()) {
          analysis = redactAnalysis(analysis);
        }
        newAnalyses.push(analysis);
      }

      setParseProgress("Saving…");
      const merged = [...analyses, ...newAnalyses];
      const store = buildHarStore(merged);
      await saveHarStoreAsync(store);
      updateHarStoreCache(store);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process files");
    } finally {
      setIsProcessing(false);
      setParseProgress(null);
    }
  };

  const handleClear = async () => {
    await clearHarStoreAsync();
    updateHarStoreCache(null);
    setError(null);
  };

  const removeFile = async (index: number) => {
    const removed = analyses[index];
    if (removed) {
      await deleteBodiesAsync(collectBodyIds([removed]));
    }
    const updated = analyses
      .filter((_, i) => i !== index)
      .map((a, i) => ({
        ...a,
        fileIndex: i,
        entries: a.entries.map((e) => ({ ...e, harFileIndex: i })),
      }));
    const store = buildHarStore(updated);
    await saveHarStoreAsync(store);
    updateHarStoreCache(store);
  };

  return (
    <PageShell
      actions={
        analyses.length > 0 ? (
          <button
            onClick={handleClear}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Clear all
          </button>
        ) : undefined
      }
    >
      <PrivacyBanner />

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Upload HAR Files
        </h2>
        <FileUpload
          onFilesSelected={handleFilesSelected}
          isLoading={isLoading}
          progressMessage={parseProgress}
        />
        <RedactSecretsToggle disabled={isLoading} />
      </section>

      {error && (
        <div className="rounded-lg bg-red-950/40 border border-red-800/60 px-4 py-3 text-red-700 dark:text-red-300 text-sm flex items-start gap-2">
          <svg
            className="w-5 h-5 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {error}
        </div>
      )}

      {isLoading && (
        <LoadingState
          message={parseProgress ?? "Parsing HAR files..."}
        />
      )}

      {analyses.length > 0 && insights && (
        <>
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Loaded Files
              </h2>
              <span className="text-sm text-slate-600 dark:text-slate-500">
                {analyses.length} file{analyses.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {analyses.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm hover:border-blue-600 transition-colors"
                >
                  <Link
                    href={`/file/${i}`}
                    className="flex items-center gap-2 min-w-0"
                  >
                    <span
                      className="text-slate-700 dark:text-slate-300 font-mono truncate max-w-[200px]"
                      title={a.fileName}
                    >
                      {a.fileName}
                    </span>
                    <span className="text-slate-600 dark:text-slate-500 text-xs shrink-0">
                      {a.totalRequests.toLocaleString()} reqs
                    </span>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(i);
                    }}
                    className="text-slate-600 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 transition-colors ml-1 shrink-0"
                    title="Remove file"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <InsightStrip insights={insights} />

          <section>
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">
              Tools
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Link href="/performance" className={toolLinkClass}>
                Performance overview
              </Link>
              {analyses.length >= 2 && (
                <Link href="/performance/diff" className={toolLinkClass}>
                  Pair diff
                </Link>
              )}
              {insights.cors && (
                <Link href="/cors" className={toolLinkClass}>
                  CORS
                  {insights.cors.errorCount > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none">
                      {insights.cors.errorCount}
                    </span>
                  ) : insights.cors.warningCount > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                      {insights.cors.warningCount}
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold">
                      clear
                    </span>
                  )}
                </Link>
              )}
              <Link href="/kv-search" className={toolLinkClass}>
                Search headers/cookies
              </Link>
              <Link href="/entry-diff" className={toolLinkClass}>
                Entry diff
              </Link>
              <Link href="/mime-mismatch" className={toolLinkClass}>
                MIME mismatch
                {insights.mimeMismatch && insights.mimeMismatch.mismatchCount > 0 ? (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                    {insights.mimeMismatch.mismatchCount}
                  </span>
                ) : insights.mimeMismatch ? (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold">
                    clear
                  </span>
                ) : null}
              </Link>
              <Link href="/cache-validator" className={toolLinkClass}>
                Cache validator
                {insights.cacheValidator &&
                insights.cacheValidator.pathConflictCount > 0 ? (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                    {insights.cacheValidator.pathConflictCount}
                  </span>
                ) : insights.cacheValidator ? (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold">
                    clear
                  </span>
                ) : null}
              </Link>
            </div>
          </section>

          <section>
            <button
              type="button"
              onClick={() => setMetricsOpen((o) => !o)}
              className="flex items-center gap-2 w-full text-left group"
              aria-expanded={metricsOpen}
            >
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                Full metrics table
              </h2>
              <span className="text-slate-500 dark:text-slate-500 text-sm">
                {metricsOpen ? "Hide" : "Show"}
              </span>
              <span
                className="ml-auto text-slate-500 dark:text-slate-500 text-xs"
                aria-hidden
              >
                {metricsOpen ? "▼" : "▶"}
              </span>
            </button>
            {metricsOpen && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-500">
                  Click on &quot;Unique URLs&quot;, a status code, a content
                  type, a content size, or a server IP to view detailed
                  breakdowns.
                </p>
                <ComparisonTable analyses={analyses} />
              </div>
            )}
          </section>
        </>
      )}

      {!analyses.length && !isLoading && (
        <div className="text-center py-16 text-slate-600 dark:text-slate-600">
          <p className="text-lg">
            Upload one or more HAR files to start analyzing
          </p>
          <p className="text-sm mt-2">
            HAR (HTTP Archive) files can be exported from browser DevTools
          </p>
        </div>
      )}
    </PageShell>
  );
}
