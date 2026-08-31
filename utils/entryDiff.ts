import type { EntryRecord } from "@/types/har";
import {
  getContentDiffEntryBadge,
  isBinaryEntry,
  type DiffResult,
} from "@/utils/contentDiff";
import type { HeaderDiffResult } from "@/utils/headerDiff";

export type EntryDiffSection = "headers" | "content";

export function parseEntryDiffSection(
  value: string | null | undefined,
): EntryDiffSection {
  return value === "content" ? "content" : "headers";
}

export function countHeaderChanges(result: HeaderDiffResult): number {
  const sections = [
    result.requestHeaders,
    result.responseHeaders,
    result.requestCookies,
    result.responseCookies,
  ];
  return sections.reduce(
    (sum, entries) => sum + entries.filter((e) => e.kind !== "equal").length,
    0,
  );
}

/** Short label for the Headers tab chip. */
export function headerTabStatus(result: HeaderDiffResult | null): string | null {
  if (!result) return null;
  if (result.identical) return "identical";
  const n = countHeaderChanges(result);
  return `${n} change${n !== 1 ? "s" : ""}`;
}

/** Short label for the Content tab chip. */
export function contentTabStatus(
  baseline: EntryRecord,
  compare: EntryRecord,
  diffResult: DiffResult | null,
  bodiesLoading: boolean,
): string {
  if (bodiesLoading) return "loading…";
  const baseBadge = getContentDiffEntryBadge(baseline);
  const cmpBadge = getContentDiffEntryBadge(compare);
  if (baseBadge === "binary" || cmpBadge === "binary") return "binary";
  if (baseBadge === "no body" || cmpBadge === "no body") return "no body";
  if (isBinaryEntry(baseline) || isBinaryEntry(compare)) return "hash";
  if (!diffResult) return "text";
  if (diffResult.identical) return "identical";
  return "diff";
}

/** Pick the tab that likely has the most interesting differences. */
export function defaultEntryDiffSection(
  headerDiff: HeaderDiffResult | null,
): EntryDiffSection {
  if (headerDiff && !headerDiff.identical) return "headers";
  return "content";
}

/** Preserve query string when rewriting a legacy content/header-diff URL. */
export function entryDiffRedirectTarget(
  from: "content" | "headers",
  search: string,
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set("section", from);
  const qs = params.toString();
  return qs ? `/entry-diff?${qs}` : `/entry-diff?section=${from}`;
}
