"use client";

import type { EntryDiffSection } from "@/utils/entryDiff";

interface EntryDiffTabsProps {
  section: EntryDiffSection;
  onSectionChange: (section: EntryDiffSection) => void;
  headerStatus: string | null;
  contentStatus: string | null;
}

function TabChip({ label, active }: { label: string; active: boolean }) {
  const lower = label.toLowerCase();
  let className =
    "ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ";

  if (active) {
    className += "bg-white/20 text-white";
  } else if (lower === "identical") {
    className += "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400";
  } else if (lower.includes("change") || lower === "diff") {
    className += "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300";
  } else if (lower === "binary" || lower === "no body" || lower === "hash") {
    className += "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300";
  } else {
    className += "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400";
  }

  return <span className={className}>{label}</span>;
}

export function EntryDiffTabs({
  section,
  onSectionChange,
  headerStatus,
  contentStatus,
}: EntryDiffTabsProps) {
  const tabs: { id: EntryDiffSection; label: string; status: string | null }[] = [
    { id: "headers", label: "Headers", status: headerStatus },
    { id: "content", label: "Content", status: contentStatus },
  ];

  return (
    <div
      role="tablist"
      aria-label="Diff sections"
      className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden w-fit"
    >
      {tabs.map(({ id, label, status }) => {
        const active = section === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`entry-diff-panel-${id}`}
            id={`entry-diff-tab-${id}`}
            onClick={() => onSectionChange(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center ${
              active
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            } ${id === "content" ? "border-l border-slate-200 dark:border-slate-700" : ""}`}
          >
            {label}
            {status && (
              <TabChip
                label={status}
                active={active}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
