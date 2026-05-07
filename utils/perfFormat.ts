/**
 * Pure formatting / tinting helpers for the pair-mode performance dashboard.
 *
 * Kept separate from `utils/perfStats.ts` (numeric aggregation) so the
 * presentation-layer concerns — string formatting, Tailwind class selection —
 * stay testable without pulling React or DOM types.
 */

/**
 * Which direction of change is "better" for color-tinting purposes.
 *
 * - `lower`   — smaller compare value is the improvement (e.g. response time).
 * - `higher`  — larger compare value is the improvement (e.g. cache hit rate).
 * - `neutral` — change is informational only (e.g. request count, total bytes).
 */
export type Direction = "lower" | "higher" | "neutral";

/**
 * Tailwind class string for a Δ value's text color.
 *
 * Returns slate (no judgment) for neutral metrics or zero Δ; emerald when the
 * compare side is the improvement; red when the compare side regressed.
 */
export function deltaTone(delta: number, direction: Direction): string {
  if (direction === "neutral" || delta === 0) {
    return "text-slate-700 dark:text-slate-300";
  }
  const compareIsBetter = direction === "lower" ? delta < 0 : delta > 0;
  return compareIsBetter
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}

/**
 * Render a percentage change between baseline and compare.
 *
 * - Returns `"—"` when the baseline is 0 and compare is non-zero (undefined
 *   ratio); returns `"0%"` when both sides are 0.
 * - Precision adapts to magnitude: `±0.00%` for sub-10%, `±0.0%` for 10–100%,
 *   `±0%` once the change reaches 100% or more.
 * - Positive changes are prefixed with `+`; negatives carry the native `-`.
 */
export function formatPctChange(base: number, cmp: number): string {
  if (base === 0) return cmp === 0 ? "0%" : "—";
  const pct = ((cmp - base) / base) * 100;
  const sign = pct > 0 ? "+" : "";
  const abs = Math.abs(pct);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${sign}${pct.toFixed(digits)}%`;
}

/**
 * Render a signed Δ value via the row's own formatter.
 *
 * Uses a real minus sign (U+2212) for negative values to match the typographic
 * convention elsewhere in the dashboard, and `+` for positives. Zero is
 * rendered through `format(0)` so the row's units (e.g. `"0 ms"`) survive.
 */
export function formatDelta(
  delta: number,
  format: (n: number) => string,
): string {
  if (delta === 0) return format(0);
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${format(Math.abs(delta))}`;
}
