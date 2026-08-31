"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import HeaderDiffView from "@/components/HeaderDiffView";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { UrlPathPicker } from "@/components/shared/UrlPathPicker";
import { EntryDiffMetadataBar } from "@/components/entry-diff/EntryDiffMetadataBar";
import { EntryPickTable } from "@/components/entry-diff/EntryPickTable";
import { EntryDiffTabs } from "@/components/entry-diff/EntryDiffTabs";
import { ContentDiffResultPanel } from "@/components/entry-diff/ContentDiffResultPanel";
import { useEntryDiffSelection } from "@/hooks/useEntryDiffSelection";
import { computeHeaderDiff } from "@/utils/headerDiff";
import {
  contentTabStatus,
  headerTabStatus,
  parseEntryDiffSection,
  type EntryDiffSection,
} from "@/utils/entryDiff";

function EntryDiffPageContent() {
  const searchParams = useSearchParams();
  const urlParam = searchParams.get("url") ?? "";
  const [section, setSection] = useState<EntryDiffSection>(() =>
    parseEntryDiffSection(searchParams.get("section")),
  );

  const {
    analyses,
    isLoading,
    baselineId,
    setBaselineId,
    compareId,
    setCompareId,
    urlEntries,
    baselineEntry,
    compareEntry,
    sameEntrySelected,
    bothSelected,
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
  } = useEntryDiffSelection(urlParam);

  const headerDiff = useMemo(() => {
    if (!bothSelected || !baselineEntry || !compareEntry) return null;
    return computeHeaderDiff(baselineEntry, compareEntry);
  }, [bothSelected, baselineEntry, compareEntry]);

  const headerStatus = headerTabStatus(headerDiff);
  const contentStatus =
    bothSelected && baselineEntry && compareEntry
      ? contentTabStatus(baselineEntry, compareEntry, null, false)
      : null;

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  return (
    <PageShell
      back={{ href: "/", label: "Home" }}
      crumb="Entry Diff"
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
            urlParamNotFound={
              !isLoading && analyses.length > 0 && urlParamNotFound
            }
            urlParam={urlParam}
          />

          {selectedUrl && urlEntries.length > 0 && (
            <EntryPickTable
              entries={urlEntries}
              baselineId={baselineId}
              compareId={compareId}
              onSelectBaseline={setBaselineId}
              onSelectCompare={setCompareId}
            />
          )}

          {sameEntrySelected && (
            <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 px-4 py-3 text-sm text-orange-700 dark:text-orange-400">
              Select two different entries to compare
            </div>
          )}

          {bothSelected && baselineEntry && compareEntry && (
            <div className="space-y-4">
              <EntryDiffMetadataBar
                baseline={baselineEntry}
                compare={compareEntry}
              />

              <EntryDiffTabs
                section={section}
                onSectionChange={setSection}
                headerStatus={headerStatus}
                contentStatus={contentStatus}
              />

              {section === "headers" && headerDiff && (
                <div
                  id="entry-diff-panel-headers"
                  role="tabpanel"
                  aria-labelledby="entry-diff-tab-headers"
                  className="space-y-4"
                >
                  {headerDiff.identical && (
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
                      Identical — all headers and cookies match exactly
                    </div>
                  )}
                  <HeaderDiffView result={headerDiff} />
                </div>
              )}

              {section === "content" && (
                <div
                  id="entry-diff-panel-content"
                  role="tabpanel"
                  aria-labelledby="entry-diff-tab-content"
                >
                  <ContentDiffResultPanel
                    baseline={baselineEntry}
                    compare={compareEntry}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

export default function EntryDiffPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <EntryDiffPageContent />
    </Suspense>
  );
}
