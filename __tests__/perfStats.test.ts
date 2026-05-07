/**
 * Tests for utils/perfStats.ts
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import {
  normalizeTiming,
  isErrorStatus,
  percentile,
  computePerfStats,
  computeTimingAvgs,
  buildBucketEdges,
  bucketIndex,
  computeHistogram,
  computeRegressions,
  computeContentTypePerf,
  computeContentTypeDelta,
  TIMING_PHASE_KEYS,
} from "@/utils/perfStats";
import type { EntryRecord } from "@/types/har";

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    url: "https://example.com/api",
    method: "GET",
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    contentSize: 100,
    bodySize: 100,
    time: 50,
    timings: { send: 1, wait: 40, receive: 9 },
    harFileName: "a.har",
    harFileIndex: 0,
    requestHeaders: [],
    responseHeaders: [],
    requestCookies: [],
    responseCookies: [],
    serverIPAddress: "",
    userAgent: "",
    startedDateTime: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeTiming", () => {
  it("treats HAR -1 sentinel and undefined as 0", () => {
    expect(normalizeTiming(-1)).toBe(0);
    expect(normalizeTiming(undefined)).toBe(0);
    expect(normalizeTiming(0)).toBe(0);
    expect(normalizeTiming(42)).toBe(42);
  });
});

describe("isErrorStatus", () => {
  it("counts network failure (0) and 4xx/5xx as errors", () => {
    expect(isErrorStatus(0)).toBe(true);
    expect(isErrorStatus(400)).toBe(true);
    expect(isErrorStatus(503)).toBe(true);
    expect(isErrorStatus(200)).toBe(false);
    expect(isErrorStatus(301)).toBe(false);
    expect(isErrorStatus(399)).toBe(false);
  });
});

describe("percentile", () => {
  it("returns 0 for empty input", () => {
    expect(percentile([], 50)).toBe(0);
  });
  it("uses inclusive nearest-rank semantics", () => {
    const xs = [10, 20, 30, 40, 50];
    expect(percentile(xs, 50)).toBe(30);
    expect(percentile(xs, 100)).toBe(50);
    expect(percentile(xs, 1)).toBe(10);
  });
});

describe("computePerfStats", () => {
  it("returns zeros for empty input", () => {
    const s = computePerfStats([]);
    expect(s.count).toBe(0);
    expect(s.totalBytes).toBe(0);
    expect(s.errorRate).toBe(0);
    expect(s.wallClockMs).toBe(0);
  });
  it("counts status 0 as an error", () => {
    const s = computePerfStats([
      makeEntry({ status: 200 }),
      makeEntry({ status: 0 }),
      makeEntry({ status: 500 }),
      makeEntry({ status: 404 }),
    ]);
    expect(s.errorCount).toBe(3);
    expect(s.errorRate).toBe(75);
  });
  it("computes percentiles and totals", () => {
    const entries = [10, 20, 30, 40, 50].map((t) =>
      makeEntry({ time: t, contentSize: t * 10 }),
    );
    const s = computePerfStats(entries);
    expect(s.count).toBe(5);
    expect(s.p50).toBe(30);
    expect(s.p95).toBe(50);
    expect(s.maxTime).toBe(50);
    expect(s.totalBytes).toBe(1500);
    expect(s.avgTime).toBe(30);
  });
  it("computes wall-clock span across the whole batch", () => {
    const s = computePerfStats([
      makeEntry({ startedDateTime: "2024-01-01T00:00:00.000Z", time: 100 }),
      makeEntry({ startedDateTime: "2024-01-01T00:00:00.500Z", time: 200 }),
    ]);
    expect(s.wallClockMs).toBe(700);
  });
});

describe("computeTimingAvgs", () => {
  it("averages each phase and ignores -1 sentinels", () => {
    const e1 = makeEntry({
      timings: {
        dns: 10,
        connect: 20,
        ssl: -1,
        send: 1,
        wait: 100,
        receive: 5,
      },
    });
    const e2 = makeEntry({
      timings: {
        dns: 20,
        connect: 40,
        ssl: 30,
        send: 3,
        wait: 50,
        receive: 15,
      },
    });
    const r = computeTimingAvgs([e1, e2]);
    expect(r.avgs.dns).toBe(15);
    expect(r.avgs.connect).toBe(30);
    expect(r.avgs.ssl).toBe(15);
    expect(r.avgs.send).toBe(2);
    expect(r.avgs.wait).toBe(75);
    expect(r.avgs.receive).toBe(10);
    const expectedTotal = TIMING_PHASE_KEYS.reduce((s, k) => s + r.avgs[k], 0);
    expect(r.total).toBeCloseTo(expectedTotal, 6);
  });
  it("returns zeros for empty input", () => {
    const r = computeTimingAvgs([]);
    expect(r.total).toBe(0);
    for (const k of TIMING_PHASE_KEYS) expect(r.avgs[k]).toBe(0);
  });
});

describe("buildBucketEdges", () => {
  it("produces N+1 monotonically increasing edges (linear)", () => {
    const e = buildBucketEdges(0, 100, 10, "linear");
    expect(e).toHaveLength(11);
    expect(e[0]).toBe(0);
    expect(e[10]).toBe(100);
    for (let i = 1; i < e.length; i++) expect(e[i]).toBeGreaterThan(e[i - 1]);
  });
  it("produces N+1 monotonically increasing edges (log)", () => {
    const e = buildBucketEdges(1, 1000, 10, "log");
    expect(e).toHaveLength(11);
    expect(e[0]).toBeCloseTo(1, 6);
    expect(e[10]).toBeCloseTo(1000, 6);
    for (let i = 1; i < e.length; i++) expect(e[i]).toBeGreaterThan(e[i - 1]);
  });
  it("clamps log lower bound to >= 1ms so 0ms entries fit in bucket 0", () => {
    const e = buildBucketEdges(0, 1000, 10, "log");
    expect(e[0]).toBeGreaterThanOrEqual(1);
    expect(bucketIndex(0, e)).toBe(0);
  });
  it("handles degenerate range (min === max)", () => {
    const e = buildBucketEdges(50, 50, 10, "linear");
    expect(e).toHaveLength(11);
    expect(bucketIndex(50, e)).toBe(0);
  });
});

describe("bucketIndex", () => {
  it("places below-min into 0 and above-max into the last bin", () => {
    const edges = [0, 10, 20, 30];
    expect(bucketIndex(-5, edges)).toBe(0);
    expect(bucketIndex(0, edges)).toBe(0);
    expect(bucketIndex(5, edges)).toBe(0);
    expect(bucketIndex(10, edges)).toBe(1);
    expect(bucketIndex(25, edges)).toBe(2);
    expect(bucketIndex(30, edges)).toBe(2);
    expect(bucketIndex(999, edges)).toBe(2);
  });
});

describe("computeHistogram", () => {
  it("uses a single shared axis derived from the union of all files", () => {
    const fileA = [10, 20].map((t) => makeEntry({ time: t }));
    const fileB = [500, 1000].map((t) => makeEntry({ time: t }));
    const h = computeHistogram([fileA, fileB], { scale: "log", bins: 10 });
    // edges span from min(10) to max(1000)
    expect(h.edges[0]).toBeCloseTo(10, 0);
    expect(h.edges[h.edges.length - 1]).toBeCloseTo(1000, 0);
    expect(h.counts).toHaveLength(2);
    expect(h.counts[0].reduce((s, n) => s + n, 0)).toBe(2);
    expect(h.counts[1].reduce((s, n) => s + n, 0)).toBe(2);
    // bucket alignment: file A's 10ms must NOT fall into the same bucket as
    // file B's 1000ms — that is the entire point of a shared log axis.
    const aBucket = h.counts[0].findIndex((n) => n > 0);
    const bBucketLast =
      h.counts[1].lastIndexOf?.(
        h.counts[1].filter((n) => n > 0).slice(-1)[0],
      ) ?? h.counts[1].length - 1;
    expect(aBucket).toBeLessThan(bBucketLast);
  });
  it("returns a graceful empty histogram when no entries exist", () => {
    const h = computeHistogram([[], []], { scale: "log", bins: 10 });
    expect(h.counts).toHaveLength(2);
    expect(h.counts[0]).toEqual([0]);
    expect(h.counts[1]).toEqual([0]);
  });
});

describe("computeRegressions", () => {
  it("matches by path by default — query strings are ignored", () => {
    const base = [
      makeEntry({ url: "https://x.com/a?v=1", time: 100 }),
      makeEntry({ url: "https://x.com/b", time: 200 }),
    ];
    const cmp = [
      makeEntry({ url: "https://x.com/a?v=2", time: 250 }),
      makeEntry({ url: "https://x.com/b", time: 150 }),
    ];
    const r = computeRegressions(base, cmp, { matchKey: "path" });
    expect(r.regressions).toHaveLength(1);
    expect(r.regressions[0].url).toContain("/a");
    expect(r.regressions[0].deltaTime).toBe(150);
    expect(r.improvements).toHaveLength(1);
    expect(r.improvements[0].url).toContain("/b");
    expect(r.improvements[0].deltaTime).toBe(-50);
    expect(r.onlyInCompare).toHaveLength(0);
    expect(r.onlyInBase).toHaveLength(0);
  });
  it("treats different query strings as distinct URLs in full mode", () => {
    const base = [makeEntry({ url: "https://x.com/a?v=1", time: 100 })];
    const cmp = [makeEntry({ url: "https://x.com/a?v=2", time: 250 })];
    const r = computeRegressions(base, cmp, { matchKey: "full" });
    expect(r.regressions).toHaveLength(0);
    expect(r.onlyInCompare).toHaveLength(1);
    expect(r.onlyInBase).toHaveLength(1);
    expect(r.onlyInCompare[0].url).toBe("https://x.com/a?v=2");
    expect(r.onlyInBase[0].url).toBe("https://x.com/a?v=1");
  });
  it("onlyInBase / onlyInCompare carry per-URL stats", () => {
    const base = [
      makeEntry({ url: "https://x.com/missing", time: 80, contentSize: 1000 }),
      makeEntry({ url: "https://x.com/missing", time: 100, contentSize: 2000 }),
      makeEntry({ url: "https://x.com/missing", time: 120, contentSize: 3000 }),
    ];
    const cmp = [
      makeEntry({ url: "https://x.com/added", time: 500, contentSize: 50_000 }),
    ];
    const r = computeRegressions(base, cmp, { matchKey: "path" });
    expect(r.regressions).toHaveLength(0);
    expect(r.improvements).toHaveLength(0);
    expect(r.onlyInBase).toHaveLength(1);
    expect(r.onlyInBase[0]).toMatchObject({
      url: "https://x.com/missing",
      count: 3,
      medianTime: 100,
      medianSize: 2000,
    });
    expect(r.onlyInCompare).toHaveLength(1);
    expect(r.onlyInCompare[0]).toMatchObject({
      url: "https://x.com/added",
      count: 1,
      medianTime: 500,
      medianSize: 50_000,
    });
  });
  it("unique-URL lists are sorted by medianTime desc", () => {
    const base = [
      makeEntry({ url: "https://x.com/fast", time: 10 }),
      makeEntry({ url: "https://x.com/slow", time: 1000 }),
      makeEntry({ url: "https://x.com/mid", time: 200 }),
    ];
    const r = computeRegressions(base, [], { matchKey: "path" });
    expect(r.onlyInBase.map((u) => u.url)).toEqual([
      "https://x.com/slow",
      "https://x.com/mid",
      "https://x.com/fast",
    ]);
  });
  it("uses median when a URL is repeated within a file", () => {
    const base = [10, 20, 30].map((t) =>
      makeEntry({ url: "https://x.com/a", time: t }),
    );
    const cmp = [100, 200, 300].map((t) =>
      makeEntry({ url: "https://x.com/a", time: t }),
    );
    const r = computeRegressions(base, cmp, { matchKey: "path" });
    expect(r.regressions[0].baseTime).toBe(20);
    expect(r.regressions[0].cmpTime).toBe(200);
    expect(r.regressions[0].deltaTime).toBe(180);
  });
  it("regressions sorted desc by Δtime, improvements sorted asc", () => {
    const base = [
      makeEntry({ url: "https://x.com/a", time: 100 }),
      makeEntry({ url: "https://x.com/b", time: 100 }),
      makeEntry({ url: "https://x.com/c", time: 100 }),
      makeEntry({ url: "https://x.com/d", time: 100 }),
    ];
    const cmp = [
      makeEntry({ url: "https://x.com/a", time: 200 }),
      makeEntry({ url: "https://x.com/b", time: 500 }),
      makeEntry({ url: "https://x.com/c", time: 50 }),
      makeEntry({ url: "https://x.com/d", time: 10 }),
    ];
    const r = computeRegressions(base, cmp, { matchKey: "path" });
    expect(r.regressions.map((x) => x.deltaTime)).toEqual([400, 100]);
    expect(r.improvements.map((x) => x.deltaTime)).toEqual([-90, -50]);
  });
});

describe("computeContentTypePerf", () => {
  it("aggregates per content type and sorts by count desc", () => {
    const entries = [
      makeEntry({
        contentType: "application/json",
        time: 10,
        contentSize: 100,
      }),
      makeEntry({
        contentType: "application/json",
        time: 30,
        contentSize: 200,
      }),
      makeEntry({ contentType: "image/png", time: 500, contentSize: 50_000 }),
    ];
    const rows = computeContentTypePerf(entries);
    expect(rows[0].contentType).toBe("application/json");
    expect(rows[0].count).toBe(2);
    expect(rows[0].avgTime).toBe(20);
    expect(rows[0].totalBytes).toBe(300);
    expect(rows[1].contentType).toBe("image/png");
    expect(rows[1].count).toBe(1);
  });
});

describe("computeContentTypeDelta", () => {
  it("unions content types from both runs and reports per-side stats", () => {
    const base = [
      makeEntry({
        contentType: "application/json",
        time: 10,
        contentSize: 100,
      }),
      makeEntry({ contentType: "image/png", time: 500, contentSize: 50_000 }),
    ];
    const cmp = [
      makeEntry({
        contentType: "application/json",
        time: 30,
        contentSize: 200,
      }),
      makeEntry({ contentType: "text/css", time: 50, contentSize: 1000 }),
    ];
    const rows = computeContentTypeDelta(base, cmp);
    const byCt = new Map(rows.map((r) => [r.contentType, r]));

    const json = byCt.get("application/json")!;
    expect(json.base?.count).toBe(1);
    expect(json.cmp?.count).toBe(1);
    expect(json.delta.avgTime).toBe(20);
    expect(json.delta.totalBytes).toBe(100);

    const png = byCt.get("image/png")!;
    expect(png.cmp).toBeNull();
    expect(png.delta.count).toBe(-1);
    expect(png.delta.totalBytes).toBe(-50_000);

    const css = byCt.get("text/css")!;
    expect(css.base).toBeNull();
    expect(css.delta.count).toBe(1);
    expect(css.delta.avgTime).toBe(50);
  });
  it("sorts rows by |Δcount| descending", () => {
    const base = [
      makeEntry({ contentType: "a", time: 0 }),
      makeEntry({ contentType: "a", time: 0 }),
    ];
    const cmp = [
      makeEntry({ contentType: "a", time: 0 }),
      makeEntry({ contentType: "b", time: 0 }),
      makeEntry({ contentType: "b", time: 0 }),
      makeEntry({ contentType: "b", time: 0 }),
    ];
    const rows = computeContentTypeDelta(base, cmp);
    expect(rows.map((r) => r.contentType)).toEqual(["b", "a"]);
  });
});
