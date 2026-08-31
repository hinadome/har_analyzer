"use client";

import type { UrlGroup } from "@/utils/contentDiff";

export interface UrlPathPickerProps {
  urlInput: string;
  onUrlInputChange: (value: string) => void;
  matchExactUrl: boolean;
  onMatchExactUrlChange: (exact: boolean) => void;
  showDropdown: boolean;
  onShowDropdownChange: (show: boolean) => void;
  urlGroups: UrlGroup[];
  onSelect: (urlOrPath: string) => void;
  onClear: () => void;
  selectedUrl: string | null;
  /** When `?url=` was provided but no matching entry exists in the store. */
  urlParamNotFound?: boolean;
  urlParam?: string;
}

/**
 * Shared search + path/exact toggle + grouped dropdown + selection banner
 * used by content-diff and header-diff.
 */
export function UrlPathPicker({
  urlInput,
  onUrlInputChange,
  matchExactUrl,
  onMatchExactUrlChange,
  showDropdown,
  onShowDropdownChange,
  urlGroups,
  onSelect,
  onClear,
  selectedUrl,
  urlParamNotFound,
  urlParam = "",
}: UrlPathPickerProps) {
  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Search by path
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={matchExactUrl}
              onChange={(e) => onMatchExactUrlChange(e.target.checked)}
              className="accent-blue-600"
            />
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Match full URL
            </span>
          </label>
        </div>
        <div className="relative">
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => onUrlInputChange(e.target.value)}
              onFocus={() => urlInput && onShowDropdownChange(true)}
              placeholder="e.g. /hello"
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 dark:focus:border-blue-500 transition-colors"
              onKeyDown={(e) => {
                if (e.key !== "Enter" || urlGroups.length === 0) return;
                e.preventDefault();
                onSelect(urlGroups[0].basePath);
              }}
            />
            {urlInput && (
              <button
                type="button"
                onClick={onClear}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
              >
                Clear
              </button>
            )}
          </div>

          {showDropdown && urlInput && (
            <div className="absolute z-20 w-full mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-72 overflow-y-auto">
              {urlGroups.length > 0 ? (
                urlGroups.map((group) => (
                  <div key={group.basePath}>
                    <button
                      type="button"
                      onClick={() => onSelect(group.basePath)}
                      className="w-full text-left px-4 py-2 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors border-b border-slate-100 dark:border-slate-800 truncate block"
                      title={group.basePath}
                    >
                      {group.basePath}
                    </button>
                    {!matchExactUrl &&
                      group.fullUrls.map((fullUrl) => (
                        <button
                          type="button"
                          key={fullUrl}
                          onClick={() => onSelect(group.basePath)}
                          className="w-full text-left pl-8 pr-4 py-1.5 text-xs font-mono text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 truncate block"
                          title={fullUrl}
                        >
                          {fullUrl}
                        </button>
                      ))}
                  </div>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-500 italic">
                  No matching URLs or paths
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {urlParamNotFound && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 px-5 py-4 text-sm text-orange-700 dark:text-orange-400">
          URL not found in loaded HAR data:{" "}
          <span className="font-mono break-all">{urlParam}</span>
        </div>
      )}

      {selectedUrl && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-5 py-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wider">
              {matchExactUrl ? "Selected URL" : "Selected path"}
            </p>
            {!matchExactUrl && (
              <span className="text-xs text-amber-600 dark:text-amber-400 italic">
                all hosts with this pathname
              </span>
            )}
          </div>
          <p className="font-mono text-sm text-slate-900 dark:text-slate-100 break-all">
            {selectedUrl}
          </p>
        </div>
      )}
    </>
  );
}
