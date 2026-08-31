import StatusBadge from "@/components/StatusBadge";
import type { EntryRecord } from "@/types/har";

interface EntryDiffMetadataBarProps {
  baseline: EntryRecord;
  compare: EntryRecord;
}

export function EntryDiffMetadataBar({
  baseline,
  compare,
}: EntryDiffMetadataBarProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[
        { label: "Baseline", entry: baseline },
        { label: "Compare", entry: compare },
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
              {new Date(entry.startedDateTime).toLocaleString("en-US", {
                timeZone: "UTC",
              })}{" "}
              UTC
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
