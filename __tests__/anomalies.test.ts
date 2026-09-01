import { describe, it, expect } from "vitest";
import {
  analyzeStore,
  encodingKey,
  isLargeUncompressed,
  scopedCategorySlice,
  SIZE_MIN_DELTA_BYTES,
  SIZE_RATIO_THRESHOLD,
} from "@/utils/anomalies";
import type { EntryRecord, HarAnalysis } from "@/types/har";

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    harFileIndex: 0,
    harFileName: "a.har",
    indexInFile: 0,
    url: "https://example.com/api/data",
    method: "GET",
    status: 200,
    contentType: "application/json",
    contentSize: 100,
    time: 50,
    startedDateTime: "2026-01-01T00:00:00.000Z",
    requestHeaders: [],
    responseHeaders: [],
    requestCookies: [],
    responseCookies: [],
    ...overrides,
  };
}

function makeAnalysis(entries: EntryRecord[], fileIndex = 0): HarAnalysis {
  return {
    fileIndex,
    fileName: fileIndex === 0 ? "a.har" : "b.har",
    totalRequests: entries.length,
    totalContentSize: entries.reduce((n, e) => n + e.contentSize, 0),
    statusCodeCounts: { 200: entries.length },
    methodCounts: { GET: entries.length },
    contentTypeCounts: {},
    contentSizeBucketCounts: {},
    serverIPCounts: {},
    uniqueUrlCount: entries.length,
    entries,
  };
}

describe("status anomalies", () => {
  it("flags mixed status on same pathname", () => {
    const entries = [
      makeEntry({ indexInFile: 0, status: 200 }),
      makeEntry({
        indexInFile: 1,
        url: "https://example.com/api/data?q=1",
        status: 404,
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.status.pathGroupCount).toBe(1);
    expect(report.status.groups[0].distinctStatuses).toEqual([200, 404]);
  });
});

describe("size drift", () => {
  it("flags when ratio exceeds threshold", () => {
    const entries = [
      makeEntry({ indexInFile: 0, contentSize: 10_000 }),
      makeEntry({
        indexInFile: 1,
        url: "https://example.com/api/data?v=2",
        contentSize: 30_000,
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.size.pathGroupCount).toBe(1);
    expect(report.size.groups[0].ratio).toBeGreaterThanOrEqual(SIZE_RATIO_THRESHOLD);
  });

  it("flags large absolute delta even when ratio is modest", () => {
    const entries = [
      makeEntry({ indexInFile: 0, contentSize: 100_000 }),
      makeEntry({
        indexInFile: 1,
        url: "https://example.com/api/data?x=1",
        contentSize: 100_000 + SIZE_MIN_DELTA_BYTES,
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.size.pathGroupCount).toBe(1);
  });
});

describe("encoding anomalies", () => {
  it("flags encoding drift on same path", () => {
    const entries = [
      makeEntry({
        responseHeaders: [{ name: "Content-Encoding", value: "gzip" }],
      }),
      makeEntry({
        indexInFile: 1,
        url: "https://example.com/api/data?q=1",
        responseHeaders: [{ name: "Content-Encoding", value: "br" }],
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.encoding.pathGroupCount).toBe(1);
    expect(report.encoding.groups[0].kind).toBe("encoding-drift");
  });

  it("flags large uncompressed text", () => {
    const entry = makeEntry({
      contentSize: 60_000,
      contentType: "application/json",
      responseHeaders: [],
    });
    expect(isLargeUncompressed(entry)).toBe(true);
    const report = analyzeStore([makeAnalysis([entry])]);
    expect(report.encoding.pathGroupCount).toBe(1);
    expect(report.encoding.groups[0].kind).toBe("large-uncompressed");
  });

  it("normalizes missing encoding as identity", () => {
    expect(encodingKey(makeEntry())).toBe("identity");
  });
});

describe("cache policy anomalies", () => {
  it("flags cache-control drift", () => {
    const entries = [
      makeEntry({
        responseHeaders: [{ name: "Cache-Control", value: "max-age=3600" }],
      }),
      makeEntry({
        indexInFile: 1,
        url: "https://example.com/api/data?q=1",
        responseHeaders: [{ name: "Cache-Control", value: "no-cache" }],
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.cachePolicy.pathGroupCount).toBe(1);
    expect(report.cachePolicy.groups[0].kind).toBe("cache-control");
  });

  it("flags vary drift", () => {
    const entries = [
      makeEntry({
        responseHeaders: [{ name: "Vary", value: "Accept-Encoding" }],
      }),
      makeEntry({
        indexInFile: 1,
        url: "https://example.com/api/data?a=1",
        responseHeaders: [{ name: "Vary", value: "Origin" }],
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.cachePolicy.groups[0].kind).toBe("vary");
  });
});

describe("correlations and scope", () => {
  it("correlates multiple categories on one path", () => {
    const entries = [
      makeEntry({
        indexInFile: 0,
        status: 200,
        contentSize: 5_000,
        responseHeaders: [
          { name: "Cache-Control", value: "max-age=60" },
          { name: "Content-Encoding", value: "gzip" },
        ],
      }),
      makeEntry({
        indexInFile: 1,
        url: "https://example.com/api/data?q=1",
        status: 500,
        contentSize: 50_000,
        responseHeaders: [
          { name: "Cache-Control", value: "no-store" },
          { name: "Content-Encoding", value: "identity" },
        ],
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.uniquePathCount).toBe(1);
    expect(report.correlations[0].categories.length).toBeGreaterThan(1);
  });

  it("scopes per file", () => {
    const a = makeAnalysis(
      [
        makeEntry({ status: 200 }),
        makeEntry({
          indexInFile: 1,
          url: "https://example.com/api/data?x=1",
          status: 404,
        }),
      ],
      0,
    );
    const b = makeAnalysis(
      [
        makeEntry({ status: 200 }),
        makeEntry({
          indexInFile: 1,
          url: "https://example.com/api/data?y=1",
          status: 503,
        }),
      ],
      1,
    );
    const report = analyzeStore([a, b]);
    expect(scopedCategorySlice(report, "status", 0).pathGroupCount).toBe(1);
    expect(scopedCategorySlice(report, "status", 1).pathGroupCount).toBe(1);
    expect(scopedCategorySlice(report, "status", "all").pathGroupCount).toBe(1);
  });
});
