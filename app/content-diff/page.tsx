"use client";

import { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { UrlPathPicker } from "@/components/shared/UrlPathPicker";
import { useHarStore } from "@/hooks/useHarStore";
import { useUrlPathSelection } from "@/hooks/useUrlPathSelection";
import { useEntryBody } from "@/hooks/useEntryBody";
import { formatBytes } from "@/utils/harParser";
import {
  isBinaryEntry,
  prettifyIfJson,
  truncateBody,
  computeDiff,
  entryId,
  filterEntriesBySelection,
} from "@/utils/contentDiff";
import type { EntryRecord } from "@/types/har";
import UnifiedDiffView from "@/components/UnifiedDiffView";
import SideBySideDiffView from "@/components/SideBySideDiffView";
import {
  EntryRow,
  BinaryHashCompare,
  TruncationNotice,
} from "@/components/content-diff/ContentDiffPanels";

function ContentDiffPageContent() {
  const searchParams = useSearchParams();
  const urlParam = searchParams.get("url") ?? "";

  const { analyses, isLoading } = useHarStore();

  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<"unified" | "side-by-side">(
    "unified",
  );
  const [showFullBaseline, setShowFullBaseline] = useState(false);
  const [showFullCompare, setShowFullCompare] = useState(false);

  const allUrls = useMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const a of analyses) {
      for (const e of a.entries) seen.add(e.url);
    }
    return Array.from(seen).sort();
  }, [analyses]);

  const resetEntryPicks = () => {
    setBaselineId(null);
    setCompareId(null);
    setShowFullBaseline(false);
    setShowFullCompare(false);
  };

  const {
    urlInput,
    selectedUrl,
    matchExactUrl,
    showDropdown,
    urlGroups,
    urlParamNotFound,
    handleUrlInputChange,
    handleUrlSelect,
    handleClear,
    handleMatchExactUrlChange,
    setShowDropdown,
  } = useUrlPathSelection({
    allUrls,
    urlParam,
    onSelectionReset: resetEntryPicks,
  });

  const urlEntries = useMemo<EntryRecord[]>(() => {
    if (!selectedUrl) return [];
    return filterEntriesBySelection(
      analyses.flatMap((a) => a.entries),
      selectedUrl,
      matchExactUrl,
    );
  }, [analyses, selectedUrl, matchExactUrl]);

  // Resolve selected entry objects
  const baselineEntry = useMemo<EntryRecord | null>(
    () =>
      baselineId
        ? (urlEntries.find((e) => entryId(e) === baselineId) ?? null)
        : null,
    [urlEntries, baselineId],
  );
  const compareEntry = useMemo<EntryRecord | null>(
    () =>
      compareId
        ? (urlEntries.find((e) => entryId(e) === compareId) ?? null)
        : null,
    [urlEntries, compareId],
  );

  const { body: baselineBody, loading: baselineBodyLoading } =
    useEntryBody(baselineEntry);
  const { body: compareBody, loading: compareBodyLoading } =
    useEntryBody(compareEntry);
  const bodiesLoading = baselineBodyLoading || compareBodyLoading;

  // Diff computation
  const diffData = useMemo(() => {
    if (!baselineEntry || !compareEntry) return null;
    if (baselineId === compareId) return null;
    if (isBinaryEntry(baselineEntry) || isBinaryEntry(compareEntry))
      return null;
    if (baselineBody === undefined || compareBody === undefined) return null;

    const baseRaw = baselineBody;
    const cmpRaw = compareBody;

    const baseTrunc = truncateBody(baseRaw, showFullBaseline);
    const cmpTrunc = truncateBody(cmpRaw, showFullCompare);

    const basePrettified = prettifyIfJson(
      baseTrunc.text,
      baselineEntry.contentType,
    );
    const cmpPrettified = prettifyIfJson(
      cmpTrunc.text,
      compareEntry.contentType,
    );

    const prettified =
      basePrettified.wasPrettified || cmpPrettified.wasPrettified;
    const result = computeDiff(
      basePrettified.text,
      cmpPrettified.text,
      prettified,
    );

    return {
      result,
      baseTruncated: baseTrunc.wasTruncated,
      baseFullLength: baseTrunc.fullLength,
      cmpTruncated: cmpTrunc.wasTruncated,
      cmpFullLength: cmpTrunc.fullLength,
    };
  }, [
    baselineEntry,
    compareEntry,
    baselineId,
    compareId,
    baselineBody,
    compareBody,
    showFullBaseline,
    showFullCompare,
  ]);

  const sameEntrySelected = baselineId !== null && baselineId === compareId;
  const bothSelected =
    baselineEntry !== null && compareEntry !== null && !sameEntrySelected;
  const eitherBinary =
    bothSelected &&
    (isBinaryEntry(baselineEntry!) || isBinaryEntry(compareEntry!));

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  return (
    <PageShell
      back={{ href: "/", label: "Home" }}
      crumb="Content Diff"
      mainClassName="space-y-6"
    >
        {!analyses.length ? (
          <EmptyState title="No HAR data loaded." />
        ) : (
          <>
            <UrlPathPicker
              urlInput={urlInput}
              onUrlInputChange={handleUrlInputChange}
              matchExactUrl={matchExactUrl}
              onMatchExactUrlChange={handleMatchExactUrlChange}
              showDropdown={showDropdown}
              onShowDropdownChange={setShowDropdown}
              urlGroups={urlGroups}
              onSelect={handleUrlSelect}
              onClear={handleClear}
              selectedUrl={selectedUrl}
              urlParamNotFound={!isLoading && analyses.length > 0 && urlParamNotFound}
              urlParam={urlParam}
            />

            {/* Entry list */}
            {selectedUrl && urlEntries.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                    Entries
                    <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-500">
                      {urlEntries.length} total
                    </span>
                  </h2>
                </div>

                {urlEntries.length === 1 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                    Only one entry available — select at least two to diff
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="py-3 px-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Baseline
                        </th>
                        <th className="py-3 px-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Compare
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          HAR File
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          URL
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Status
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Content Type
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Size
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-900/60">
                          Timestamp (UTC)
                        </th>
                        <th className="py-3 px-4 bg-slate-100 dark:bg-slate-900/60" />
                      </tr>
                    </thead>
                    <tbody>
                      {urlEntries.map((entry) => {
                        const id = entryId(entry);
                        return (
                          <EntryRow
                            key={id}
                            entry={entry}
                            isBaseline={baselineId === id}
                            isCompare={compareId === id}
                            onSelectBaseline={() => setBaselineId(id)}
                            onSelectCompare={() => setCompareId(id)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Validation: same entry selected */}
            {sameEntrySelected && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 px-4 py-3 text-sm text-orange-700 dark:text-orange-400">
                Select two different entries to compare
              </div>
            )}

            {/* Diff panel */}
            {bothSelected && baselineEntry && compareEntry && (
              <div className="space-y-4">
                {/* Metadata bar */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Baseline", entry: baselineEntry },
                    { label: "Compare", entry: compareEntry },
                  ].map(({ label, entry }) => (
                    <div
                      key={label}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-xs font-mono space-y-0.5"
                    >
                      <p className="text-slate-500 dark:text-slate-500 uppercase tracking-wider text-xs font-semibold mb-1">
                        {label}
                      </p>
                      <p
                        className="text-slate-700 dark:text-slate-300 truncate"
                        title={entry.harFileName}
                      >
                        {entry.harFileName}
                      </p>
                      <p
                        className="text-blue-600 dark:text-blue-400 truncate"
                        title={entry.url}
                      >
                        {entry.url}
                      </p>
                      <div className="flex items-center gap-2 pt-0.5">
                        <StatusBadge code={entry.status} />
                        <span className="text-slate-500">
                          {new Date(entry.startedDateTime).toLocaleString(
                            "en-US",
                            { timeZone: "UTC" },
                          )}{" "}
                          UTC
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Diff Mode
                  </span>
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      onClick={() => setDiffMode("unified")}
                      className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                        diffMode === "unified"
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      Unified
                    </button>
                    <button
                      onClick={() => setDiffMode("side-by-side")}
                      className={`px-4 py-1.5 text-sm font-medium border-l border-slate-200 dark:border-slate-700 transition-colors ${
                        diffMode === "side-by-side"
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      Side-by-Side
                    </button>
                  </div>
                </div>

                {/* Binary fallback — compare by SHA-256 hash */}
                {eitherBinary ? (
                  <BinaryHashCompare
                    baseline={baselineEntry}
                    compare={compareEntry}
                    baselineBody={baselineBody}
                    compareBody={compareBody}
                  />
                ) : bodiesLoading ? (
                  <p className="text-sm text-slate-600 dark:text-slate-500 py-8 text-center">
                    Loading response bodies…
                  </p>
                ) : (
                  <>
                    {/* Identical banner */}
                    {diffData?.result.identical && (
                      <div className="rounded-lg border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20 px-5 py-3 text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                        <svg
                          className="w-4 h-4"
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
                        Identical — both response bodies match exactly
                      </div>
                    )}

                    {/* JSON prettified label */}
                    {diffData?.result.prettified && (
                      <div className="text-xs text-slate-500 dark:text-slate-500 italic">
                        JSON prettified (2-space indent applied before diff)
                      </div>
                    )}

                    {/* Truncation notices */}
                    {diffData?.baseTruncated && (
                      <TruncationNotice
                        label="Baseline"
                        fullLength={diffData.baseFullLength}
                        showFull={showFullBaseline}
                        onToggle={() => setShowFullBaseline((v) => !v)}
                      />
                    )}
                    {diffData?.cmpTruncated && (
                      <TruncationNotice
                        label="Compare"
                        fullLength={diffData.cmpFullLength}
                        showFull={showFullCompare}
                        onToggle={() => setShowFullCompare((v) => !v)}
                      />
                    )}

                    {/* Diff view */}
                    {diffData &&
                      (diffMode === "unified" ? (
                        <UnifiedDiffView result={diffData.result} />
                      ) : (
                        <SideBySideDiffView result={diffData.result} />
                      ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Page export — outer shell with Suspense boundary
// ---------------------------------------------------------------------------


export default function ContentDiffPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <ContentDiffPageContent />
    </Suspense>
  );
}
