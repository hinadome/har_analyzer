import type { TimingPhaseKey } from "@/utils/perfStats";

export interface TimingPhaseStyle {
  key: TimingPhaseKey;
  label: string;
  /** Tailwind bg-… utility for stacked-bar segments. */
  bar: string;
  /** Tailwind text-… utility for value labels. */
  text: string;
  /** Tailwind bg-… utility for legend swatches (typically identical to bar). */
  dot: string;
}

export const TIMING_PHASES: readonly TimingPhaseStyle[] = [
  {
    key: "dns",
    label: "DNS",
    bar: "bg-blue-600 dark:bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-600 dark:bg-blue-500",
  },
  {
    key: "connect",
    label: "Connect",
    bar: "bg-green-600 dark:bg-green-500",
    text: "text-green-600 dark:text-green-400",
    dot: "bg-green-600 dark:bg-green-500",
  },
  {
    key: "ssl",
    label: "SSL",
    bar: "bg-purple-600 dark:bg-purple-500",
    text: "text-purple-600 dark:text-purple-400",
    dot: "bg-purple-600 dark:bg-purple-500",
  },
  {
    key: "send",
    label: "Send",
    bar: "bg-slate-400",
    text: "text-slate-700 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  {
    key: "wait",
    label: "TTFB",
    bar: "bg-amber-600 dark:bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-600 dark:bg-amber-500",
  },
  {
    key: "receive",
    label: "Receive",
    bar: "bg-cyan-600 dark:bg-cyan-500",
    text: "text-cyan-600 dark:text-cyan-400",
    dot: "bg-cyan-600 dark:bg-cyan-500",
  },
] as const;
