interface StatusBadgeProps {
  code: number;
}

export function statusColorClass(code: number): string {
  if (code >= 500) return 'text-red-400';
  if (code >= 400) return 'text-orange-400';
  if (code >= 300) return 'text-yellow-400';
  if (code >= 200) return 'text-green-400';
  return 'text-slate-400';
}

export default function StatusBadge({ code }: StatusBadgeProps) {
  let bg = 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
  if (code >= 500) bg = 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300';
  else if (code >= 400) bg = 'bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300';
  else if (code >= 300) bg = 'bg-yellow-100 dark:bg-yellow-900/60 text-yellow-700 dark:text-yellow-300';
  else if (code >= 200) bg = 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold ${bg}`}>
      {code}
    </span>
  );
}
