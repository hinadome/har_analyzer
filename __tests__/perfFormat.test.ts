/**
 * Tests for utils/perfFormat.ts
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import { deltaTone, formatDelta, formatPctChange } from "@/utils/perfFormat";

describe("deltaTone", () => {
  it("returns slate for neutral metrics regardless of sign", () => {
    expect(deltaTone(100, "neutral")).toContain("text-slate-700");
    expect(deltaTone(-100, "neutral")).toContain("text-slate-700");
    expect(deltaTone(0, "neutral")).toContain("text-slate-700");
  });

  it("returns slate when delta is exactly 0 even for directional metrics", () => {
    expect(deltaTone(0, "lower")).toContain("text-slate-700");
    expect(deltaTone(0, "higher")).toContain("text-slate-700");
  });

  it("greens an improvement when lower is better and compare went down", () => {
    expect(deltaTone(-50, "lower")).toContain("emerald");
  });

  it("reds a regression when lower is better and compare went up", () => {
    expect(deltaTone(50, "lower")).toContain("red");
  });

  it("greens an improvement when higher is better and compare went up", () => {
    expect(deltaTone(50, "higher")).toContain("emerald");
  });

  it("reds a regression when higher is better and compare went down", () => {
    expect(deltaTone(-50, "higher")).toContain("red");
  });
});

describe("formatPctChange", () => {
  it("returns 0% when both sides are 0", () => {
    expect(formatPctChange(0, 0)).toBe("0%");
  });

  it("returns em-dash when baseline is 0 but compare is non-zero", () => {
    expect(formatPctChange(0, 100)).toBe("—");
    expect(formatPctChange(0, -100)).toBe("—");
  });

  it("uses 2 decimal places for sub-10% changes", () => {
    expect(formatPctChange(100, 105)).toBe("+5.00%");
    expect(formatPctChange(100, 99)).toBe("-1.00%");
  });

  it("uses 1 decimal place for 10-99% changes", () => {
    expect(formatPctChange(100, 150)).toBe("+50.0%");
    expect(formatPctChange(100, 75)).toBe("-25.0%");
  });

  it("uses 0 decimal places for changes >= 100%", () => {
    expect(formatPctChange(100, 250)).toBe("+150%");
    expect(formatPctChange(100, 0)).toBe("-100%");
    expect(formatPctChange(10, 50)).toBe("+400%");
  });

  it("prefixes positive changes with '+'", () => {
    expect(formatPctChange(100, 100.5).startsWith("+")).toBe(true);
  });

  it("does not double-sign negative changes", () => {
    const out = formatPctChange(100, 50);
    expect(out.startsWith("-")).toBe(true);
    expect(out.startsWith("--")).toBe(false);
  });

  it("handles negative baselines symmetrically", () => {
    // (-50 - -100) / -100 * 100 = -50% — compare is 'less negative'
    expect(formatPctChange(-100, -50)).toBe("-50.0%");
  });
});

describe("formatDelta", () => {
  const ms = (n: number) => `${n} ms`;

  it("delegates to the formatter for zero with no sign added", () => {
    expect(formatDelta(0, ms)).toBe("0 ms");
  });

  it("prefixes positive deltas with '+'", () => {
    expect(formatDelta(125, ms)).toBe("+125 ms");
  });

  it("prefixes negative deltas with a real minus sign (U+2212)", () => {
    expect(formatDelta(-125, ms)).toBe("\u2212125 ms");
  });

  it("passes the absolute value to the formatter for negatives", () => {
    const recorder: number[] = [];
    formatDelta(-42, (n) => {
      recorder.push(n);
      return `${n}`;
    });
    expect(recorder).toEqual([42]);
  });

  it("composes with byte-style formatters", () => {
    const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
    expect(formatDelta(2048, kb)).toBe("+2.0 KB");
    expect(formatDelta(-2048, kb)).toBe("\u22122.0 KB");
  });
});
