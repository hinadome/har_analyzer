"use client";

import { useMemo, useState } from "react";
import { useHarStore } from "@/hooks/useHarStore";
import { useUrlPathSelection } from "@/hooks/useUrlPathSelection";
import { entryId, filterEntriesBySelection } from "@/utils/contentDiff";
import type { EntryRecord } from "@/types/har";

export function useEntryDiffSelection(urlParam: string) {
  const { analyses, isLoading } = useHarStore();

  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);

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
  };

  const urlPath = useUrlPathSelection({
    allUrls,
    urlParam,
    onSelectionReset: resetEntryPicks,
  });

  const urlEntries = useMemo<EntryRecord[]>(() => {
    if (!urlPath.selectedUrl) return [];
    return filterEntriesBySelection(
      analyses.flatMap((a) => a.entries),
      urlPath.selectedUrl,
      urlPath.matchExactUrl,
    );
  }, [analyses, urlPath.selectedUrl, urlPath.matchExactUrl]);

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

  const sameEntrySelected = baselineId !== null && baselineId === compareId;
  const bothSelected =
    baselineEntry !== null && compareEntry !== null && !sameEntrySelected;

  return {
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
    ...urlPath,
  };
}
