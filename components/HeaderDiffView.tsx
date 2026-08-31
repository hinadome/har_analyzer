import type { KvDiffEntry, HeaderDiffResult } from "@/utils/headerDiff";

interface SectionProps {
  title: string;
  entries: KvDiffEntry[];
}

function SectionStatus({ entries }: { entries: KvDiffEntry[] }) {
  const changeCount = entries.filter((e) => e.kind !== "equal").length;
  if (entries.length === 0) {
    return (
      <span className="text-xs text-slate-500 dark:text-slate-500 font-medium">
        empty
      </span>
    );
  }
  if (changeCount === 0) {
    return (
      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
        identical
      </span>
    );
  }
  return (
    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
      {changeCount} change{changeCount !== 1 ? "s" : ""}
    </span>
  );
}

function KvSection({ title, entries }: SectionProps) {
  const isEmpty = entries.length === 0;

  return (
    <section
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 h-full flex flex-col min-h-[120px]"
    >
      <header
        className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
      >
        <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          {title}
        </h3>
        <SectionStatus entries={entries} />
      </header>

      <div className="px-4 py-3 flex-1">
        {isEmpty ? (
          <p className="text-xs text-slate-500 dark:text-slate-500 italic">None</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900/70 text-slate-600 dark:text-slate-400">
                  <th
                    className="py-1.5 px-2 text-left font-semibold w-8 select-none"
                    aria-hidden="true"
                  />
                  <th className="py-1.5 px-3 text-left font-semibold w-[26%]">
                    Name
                  </th>
                  <th className="py-1.5 px-3 text-left font-semibold w-[37%]">
                    Baseline
                  </th>
                  <th className="py-1.5 px-3 text-left font-semibold w-[37%]">
                    Compare
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  let rowBg = "";
                  let prefix = " ";
                  let prefixColor = "text-slate-400";

                  if (entry.kind === "removed") {
                    rowBg = "bg-red-50 dark:bg-red-950/30";
                    prefix = "−";
                    prefixColor = "text-red-500 dark:text-red-400";
                  } else if (entry.kind === "added") {
                    rowBg = "bg-green-50 dark:bg-green-950/30";
                    prefix = "+";
                    prefixColor = "text-green-600 dark:text-green-400";
                  } else if (entry.kind === "changed") {
                    rowBg = "bg-amber-50 dark:bg-amber-950/20";
                    prefix = "~";
                    prefixColor = "text-amber-600 dark:text-amber-400";
                  }

                  return (
                    <tr
                      key={i}
                      className={`border-t border-slate-200 dark:border-slate-800/60 ${rowBg}`}
                    >
                      <td
                        className={`py-1.5 px-2 font-mono font-bold select-none align-top ${prefixColor}`}
                      >
                        {prefix}
                      </td>
                      <td className="py-1.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300 break-all align-top">
                        {entry.name}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-700 dark:text-slate-300 break-all align-top">
                        {entry.kind === "added" ? (
                          <span className="text-slate-400 dark:text-slate-600 italic">
                            —
                          </span>
                        ) : (
                          <span
                            className={
                              entry.kind === "removed"
                                ? "text-red-700 dark:text-red-300"
                                : entry.kind === "changed"
                                  ? "text-amber-700 dark:text-amber-300 line-through decoration-red-400"
                                  : ""
                            }
                          >
                            {entry.baseValue}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-700 dark:text-slate-300 break-all align-top">
                        {entry.kind === "removed" ? (
                          <span className="text-slate-400 dark:text-slate-600 italic">
                            —
                          </span>
                        ) : (
                          <span
                            className={
                              entry.kind === "added"
                                ? "text-green-700 dark:text-green-300"
                                : entry.kind === "changed"
                                  ? "text-green-700 dark:text-green-300"
                                  : ""
                            }
                          >
                            {entry.compareValue}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

interface HeaderDiffViewProps {
  result: HeaderDiffResult;
}

export default function HeaderDiffView({ result }: HeaderDiffViewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <KvSection title="Request Headers" entries={result.requestHeaders} />
      <KvSection title="Response Headers" entries={result.responseHeaders} />
      <KvSection title="Request Cookies" entries={result.requestCookies} />
      <KvSection title="Response Cookies" entries={result.responseCookies} />
    </div>
  );
}
