import type { KvDiffEntry, HeaderDiffResult } from '@/utils/headerDiff';

interface SectionProps {
  title: string;
  entries: KvDiffEntry[];
}

function KvSection({ title, entries }: SectionProps) {
  const hasChanges = entries.some((e) => e.kind !== 'equal');
  const isEmpty = entries.length === 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          {title}
        </p>
        {!isEmpty && !hasChanges && (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">identical</span>
        )}
        {hasChanges && (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            {entries.filter((e) => e.kind !== 'equal').length} change{entries.filter((e) => e.kind !== 'equal').length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isEmpty ? (
        <p className="text-xs text-slate-500 dark:text-slate-500 italic">None</p>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/60">
                <th className="py-1.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 w-8 select-none" />
                <th className="py-1.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 w-1/4">Name</th>
                <th className="py-1.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400">Baseline</th>
                <th className="py-1.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400">Compare</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                let rowBg = '';
                let prefix = ' ';
                let prefixColor = 'text-slate-400';

                if (entry.kind === 'removed') {
                  rowBg = 'bg-red-50 dark:bg-red-950/30';
                  prefix = '−';
                  prefixColor = 'text-red-500 dark:text-red-400';
                } else if (entry.kind === 'added') {
                  rowBg = 'bg-green-50 dark:bg-green-950/30';
                  prefix = '+';
                  prefixColor = 'text-green-600 dark:text-green-400';
                } else if (entry.kind === 'changed') {
                  rowBg = 'bg-amber-50 dark:bg-amber-950/20';
                  prefix = '~';
                  prefixColor = 'text-amber-600 dark:text-amber-400';
                }

                return (
                  <tr key={i} className={`border-t border-slate-200 dark:border-slate-700/40 ${rowBg}`}>
                    {/* Prefix indicator */}
                    <td className={`py-1.5 px-3 font-mono font-bold select-none ${prefixColor}`}>
                      {prefix}
                    </td>
                    {/* Name */}
                    <td className="py-1.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300 break-all align-top">
                      {entry.name}
                    </td>
                    {/* Baseline value */}
                    <td className="py-1.5 px-3 font-mono text-slate-700 dark:text-slate-300 break-all align-top">
                      {entry.kind === 'added' ? (
                        <span className="text-slate-400 dark:text-slate-600 italic">—</span>
                      ) : (
                        <span className={entry.kind === 'removed' ? 'text-red-700 dark:text-red-300' : entry.kind === 'changed' ? 'text-amber-700 dark:text-amber-300 line-through decoration-red-400' : ''}>
                          {entry.baseValue}
                        </span>
                      )}
                    </td>
                    {/* Compare value */}
                    <td className="py-1.5 px-3 font-mono text-slate-700 dark:text-slate-300 break-all align-top">
                      {entry.kind === 'removed' ? (
                        <span className="text-slate-400 dark:text-slate-600 italic">—</span>
                      ) : (
                        <span className={entry.kind === 'added' ? 'text-green-700 dark:text-green-300' : entry.kind === 'changed' ? 'text-green-700 dark:text-green-300' : ''}>
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
  );
}

interface HeaderDiffViewProps {
  result: HeaderDiffResult;
}

export default function HeaderDiffView({ result }: HeaderDiffViewProps) {
  return (
    <div className="space-y-5">
      <KvSection title="Request Headers"  entries={result.requestHeaders}  />
      <KvSection title="Response Headers" entries={result.responseHeaders} />
      <KvSection title="Request Cookies"  entries={result.requestCookies}  />
      <KvSection title="Response Cookies" entries={result.responseCookies} />
    </div>
  );
}
