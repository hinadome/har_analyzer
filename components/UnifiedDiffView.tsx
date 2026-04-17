import type { DiffResult, DiffLine, IntraSpan } from '@/utils/contentDiff';

interface DiffViewProps {
  result: DiffResult;
}

function renderLineContent(line: DiffLine) {
  if (line.spans.length > 0) {
    return (
      <>
        {line.spans.map((span: IntraSpan, i: number) => {
          if (span.kind === 'removed') {
            return (
              <span key={i} className="bg-red-300/60 dark:bg-red-700/60 rounded-sm">
                {span.text}
              </span>
            );
          }
          if (span.kind === 'added') {
            return (
              <span key={i} className="bg-green-300/60 dark:bg-green-700/60 rounded-sm">
                {span.text}
              </span>
            );
          }
          return <span key={i}>{span.text}</span>;
        })}
      </>
    );
  }
  return <>{line.text || ' '}</>;
}

export default function UnifiedDiffView({ result }: DiffViewProps) {
  if (result.unifiedLines.length === 0) {
    return (
      <p className="text-slate-500 dark:text-slate-400 text-sm italic px-4 py-6 text-center">
        No content to display
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <pre className="text-xs font-mono leading-5 min-w-full">
        {result.unifiedLines.map((line, idx) => {
          let rowBg = '';
          let prefix = ' ';
          let textColor = 'text-slate-800 dark:text-slate-200';

          if (line.kind === 'removed') {
            rowBg = 'bg-red-50 dark:bg-red-950/40';
            textColor = 'text-red-800 dark:text-red-300';
            prefix = '-';
          } else if (line.kind === 'added') {
            rowBg = 'bg-green-50 dark:bg-green-950/40';
            textColor = 'text-green-800 dark:text-green-300';
            prefix = '+';
          }

          return (
            <div key={idx} className={`flex ${rowBg}`}>
              {/* Line number gutter */}
              <span className="select-none w-10 shrink-0 text-right pr-3 text-slate-400 dark:text-slate-600 border-r border-slate-200 dark:border-slate-700 py-px">
                {line.lineNumber ?? ''}
              </span>
              {/* Prefix */}
              <span className={`select-none w-5 shrink-0 text-center ${textColor} py-px`}>
                {prefix}
              </span>
              {/* Content */}
              <span className={`flex-1 px-2 py-px whitespace-pre-wrap break-all ${textColor}`}>
                {renderLineContent(line)}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
