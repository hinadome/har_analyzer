"use client";

import { useMemo, useState } from "react";
import {
  pathKey,
  buildUrlGroups,
  filterUrlsBySearch,
  selectionExistsInUrls,
  normalizeSelectionKey,
  type UrlGroup,
} from "@/utils/contentDiff";

export interface UseUrlPathSelectionOptions {
  allUrls: string[];
  /** Deep-link `?url=` value (may be empty). */
  urlParam?: string;
  /** Called when selection / match mode changes (e.g. clear baseline/compare). */
  onSelectionReset?: () => void;
}

export interface UseUrlPathSelectionResult {
  urlInput: string;
  selectedUrl: string | null;
  matchExactUrl: boolean;
  showDropdown: boolean;
  urlGroups: UrlGroup[];
  urlParamNotFound: boolean;
  handleUrlInputChange: (value: string) => void;
  handleUrlSelect: (urlOrPath: string) => void;
  handleClear: () => void;
  handleMatchExactUrlChange: (exact: boolean) => void;
  setShowDropdown: (show: boolean) => void;
}

/**
 * Pathname-first URL/path selection state shared by entry-diff (and legacy redirects).
 * Default: select `/hello` and load entries from every host with that pathname.
 */
export function useUrlPathSelection({
  allUrls,
  urlParam = "",
  onSelectionReset,
}: UseUrlPathSelectionOptions): UseUrlPathSelectionResult {
  const [urlInput, setUrlInput] = useState(() =>
    urlParam ? pathKey(urlParam) : "",
  );
  const [selectedUrl, setSelectedUrl] = useState<string | null>(() =>
    urlParam ? pathKey(urlParam) : null,
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [matchExactUrl, setMatchExactUrl] = useState(false);

  const urlGroups = useMemo<UrlGroup[]>(() => {
    if (!urlInput) return [];
    return buildUrlGroups(filterUrlsBySearch(allUrls, urlInput), matchExactUrl);
  }, [allUrls, urlInput, matchExactUrl]);

  const urlParamNotFound =
    Boolean(urlParam) &&
    allUrls.length > 0 &&
    !selectionExistsInUrls(allUrls, urlParam, matchExactUrl);

  const handleUrlInputChange = (value: string) => {
    setUrlInput(value);
    setShowDropdown(true);
    if (!value) {
      setSelectedUrl(null);
      onSelectionReset?.();
    }
  };

  const handleUrlSelect = (urlOrPath: string) => {
    const key = normalizeSelectionKey(urlOrPath, matchExactUrl);
    setUrlInput(key);
    setSelectedUrl(key);
    setShowDropdown(false);
    onSelectionReset?.();
  };

  const handleClear = () => {
    setUrlInput("");
    setSelectedUrl(null);
    setShowDropdown(false);
    onSelectionReset?.();
  };

  const handleMatchExactUrlChange = (exact: boolean) => {
    setMatchExactUrl(exact);
    onSelectionReset?.();
    if (!exact && selectedUrl) {
      const key = pathKey(selectedUrl);
      setSelectedUrl(key);
      setUrlInput(key);
    }
  };

  return {
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
  };
}
