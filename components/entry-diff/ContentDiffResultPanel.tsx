"use client";

import { useMemo, useState } from "react";
import { useEntryBody } from "@/hooks/useEntryBody";
import UnifiedDiffView from "@/components/UnifiedDiffView";
import SideBySideDiffView from "@/components/SideBySideDiffView";
import {
  BinaryHashCompare,
  TruncationNotice,
} from "@/components/content-diff/ContentDiffPanels";
import {
  isBinaryEntry,
  prettifyIfJson,
  truncateBody,
  computeDiff,
  TRUNCATION_LIMIT,
} from "@/utils/contentDiff";
import { looksLikeBase64, decodeBase64ToText } from "@/utils/base64";
import type { EntryRecord } from "@/types/har";

interface ContentDiffResultPanelProps {
  baseline: EntryRecord;
  compare: EntryRecord;
}

export function ContentDiffResultPanel({
  baseline,
  compare,
}: ContentDiffResultPanelProps) {
  const [diffMode, setDiffMode] = useState<"unified" | "side-by-side">(
    "unified",
  );
  const [showFullBaseline, setShowFullBaseline] = useState(false);
  const [showFullCompare, setShowFullCompare] = useState(false);

  const { body: baselineBody, loading: baselineBodyLoading } =
    useEntryBody(baseline);
  const { body: compareBody, loading: compareBodyLoading } =
    useEntryBody(compare);
  const bodiesLoading = baselineBodyLoading || compareBodyLoading;
  const eitherBinary = isBinaryEntry(baseline) || isBinaryEntry(compare);

  const [decode, setDecode] = useState(false);

  // Decoded forms of each side (null when not base64 / decodes to binary).
  const baseDecoded = useMemo(
    () => (eitherBinary ? null : decodeBase64ToText(baselineBody ?? "")),
    [eitherBinary, baselineBody],
  );
  const cmpDecoded = useMemo(
    () => (eitherBinary ? null : decodeBase64ToText(compareBody ?? "")),
    [eitherBinary, compareBody],
  );
  // Only offer base64 decoding when BOTH sides look like base64 text —
  // decoding only one side would diff decoded text against raw base64.
  const canDecodeBoth = useMemo(
    () =>
      !eitherBinary &&
      !!baselineBody &&
      !!compareBody &&
      looksLikeBase64(baselineBody) &&
      looksLikeBase64(compareBody) &&
      baseDecoded !== null &&
      cmpDecoded !== null,
    [eitherBinary, baselineBody, compareBody, baseDecoded, cmpDecoded],
  );
  const decoding = decode && canDecodeBoth;

  const diffData = useMemo(() => {
    if (eitherBinary) return null;
    if (baselineBody === undefined || compareBody === undefined) return null;

    // Decode first (when enabled), then truncate, then prettify, then diff.
    const baseSource =
      decoding && baseDecoded !== null ? baseDecoded : baselineBody;
    const cmpSource =
      decoding && cmpDecoded !== null ? cmpDecoded : compareBody;

    const baseTrunc = truncateBody(baseSource, showFullBaseline);
    const cmpTrunc = truncateBody(cmpSource, showFullCompare);

    const basePrettified = prettifyIfJson(
      baseTrunc.text,
      baseline.contentType,
    );
    const cmpPrettified = prettifyIfJson(
      cmpTrunc.text,
      compare.contentType,
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
      // Whether each side CAN be truncated (full length over the limit),
      // independent of the current showFull state — so the toggle stays
      // visible after expanding and can collapse back.
      baseTruncatable: baseTrunc.fullLength > TRUNCATION_LIMIT,
      cmpTruncatable: cmpTrunc.fullLength > TRUNCATION_LIMIT,
    };
  }, [
    baseline,
    compare,
    baselineBody,
    compareBody,
    eitherBinary,
    showFullBaseline,
    showFullCompare,
    decoding,
    baseDecoded,
    cmpDecoded,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Diff Mode
        </span>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            type="button"
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
            type="button"
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
        {canDecodeBoth && (
          <button
            type="button"
            onClick={() => setDecode((v) => !v)}
            aria-pressed={decode}
            title="Both bodies look like base64-encoded text. Toggle to diff the decoded text."
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              decode
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {decode ? "Show base64" : "Decode base64"}
          </button>
        )}
      </div>

      {decoding && (
        <div className="text-xs text-blue-600 dark:text-blue-400 italic">
          Diffing base64-decoded text (both sides).
        </div>
      )}

      {eitherBinary ? (
        <BinaryHashCompare
          baseline={baseline}
          compare={compare}
          baselineBody={baselineBody}
          compareBody={compareBody}
        />
      ) : bodiesLoading ? (
        <p className="text-sm text-slate-600 dark:text-slate-500 py-8 text-center">
          Loading response bodies…
        </p>
      ) : (
        <>
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

          {diffData?.result.prettified && (
            <div className="text-xs text-slate-500 dark:text-slate-500 italic">
              JSON prettified (2-space indent applied before diff)
            </div>
          )}

          {diffData?.baseTruncatable && (
            <TruncationNotice
              label="Baseline"
              fullLength={diffData.baseFullLength}
              showFull={showFullBaseline}
              onToggle={() => setShowFullBaseline((v) => !v)}
            />
          )}
          {diffData?.cmpTruncatable && (
            <TruncationNotice
              label="Compare"
              fullLength={diffData.cmpFullLength}
              showFull={showFullCompare}
              onToggle={() => setShowFullCompare((v) => !v)}
            />
          )}

          {diffData &&
            (diffMode === "unified" ? (
              <UnifiedDiffView result={diffData.result} />
            ) : (
              <SideBySideDiffView result={diffData.result} />
            ))}
        </>
      )}
    </div>
  );
}
