/** Shared per-file color palette — used by performance, cors, kv-search. */

export const FILE_COLORS = [
  {
    bar: "bg-blue-500",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  {
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    bar: "bg-purple-500",
    dot: "bg-purple-500",
    text: "text-purple-600 dark:text-purple-400",
  },
  {
    bar: "bg-pink-500",
    dot: "bg-pink-500",
    text: "text-pink-600 dark:text-pink-400",
  },
  {
    bar: "bg-cyan-500",
    dot: "bg-cyan-500",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  {
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
  },
  {
    bar: "bg-indigo-500",
    dot: "bg-indigo-500",
    text: "text-indigo-600 dark:text-indigo-400",
  },
] as const;

export type FileColor = (typeof FILE_COLORS)[number];

export function fileColor(i: number): FileColor {
  return FILE_COLORS[i % FILE_COLORS.length];
}
