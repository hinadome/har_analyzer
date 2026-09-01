import type { EntryRecord } from "@/types/har";
import { rawHeaderContentType } from "@/utils/contentType";

function SourceChip({
  entry,
}: {
  entry: EntryRecord;
}) {
  if (entry.contentTypeSourcesAgree) return null;

  const label = entry.contentTypeFromHeader ? "from header" : "≠ HAR";
  const title = entry.contentTypeFromHeader
    ? `HAR content.mimeType was ${entry.contentMimeType}; effective type uses Content-Type header`
  : `HAR content.mimeType ${entry.contentMimeType} ≠ header ${entry.headerContentType || "—"}`;

  return (
    <span
      className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
      title={title}
    >
      {label}
    </span>
  );
}

/** Table cell: effective type + chip when HAR and header disagree. */
export function ContentTypeCell({ entry }: { entry: EntryRecord }) {
  return (
    <span className="inline-flex items-center flex-wrap gap-x-1 font-mono text-xs">
      <span className="text-purple-600 dark:text-purple-400">
        {entry.contentType || "—"}
      </span>
      <SourceChip entry={entry} />
    </span>
  );
}

/** Entry summary: one line when aligned; breakdown when split. */
export function ContentTypeSummary({ entry }: { entry: EntryRecord }) {
  const rawHeader = rawHeaderContentType(entry.responseHeaders);

  if (entry.contentTypeSourcesAgree) {
    return (
      <span className="font-mono break-all">{entry.contentType || "—"}</span>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="font-mono break-all text-slate-800 dark:text-slate-200">
        {entry.contentType || "—"}
        <span className="ml-2 text-xs font-sans text-slate-500 dark:text-slate-500">
          effective
        </span>
      </div>
      <div
        className="rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-xs space-y-1"
        role="note"
      >
        <p className="font-semibold text-amber-800 dark:text-amber-300">
          HAR content MIME and header differ
        </p>
        <p className="font-mono text-slate-700 dark:text-slate-300 break-all">
          <span className="text-slate-500 dark:text-slate-500">HAR content.mimeType: </span>
          {entry.contentMimeType}
        </p>
        <p className="font-mono text-slate-700 dark:text-slate-300 break-all">
          <span className="text-slate-500 dark:text-slate-500">Response header: </span>
          {rawHeader ?? entry.headerContentType ?? "—"}
        </p>
      </div>
    </div>
  );
}
