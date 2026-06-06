import { describe, it, expect } from "vitest";
import type { EntryRecord, HarAnalysis, HarStore } from "@/types/har";
import {
  getEntryByPosition,
  findIndexInFile,
  compareEntryToFile,
  findHeader,
  parseUrlQuery,
  throughputKBps,
  reusedConnection,
} from "@/utils/entryStats";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    url: "https://example.com/api",
    method: "GET",
    status: 200,
    statusText: "OK",
    contentType: "text/plain",
    contentSize: 0,
    bodySize: 0,
    time: 100,
    timings: { send: 1, wait: 50, receive: 49 },
    harFileName: "test.har",
    harFileIndex: 0,
    requestHeaders: [],
    responseHeaders: [],
    requestCookies: [],
    responseCookies: [],
    serverIPAddress: "",
    userAgent: "",
    responseContent: "",
    startedDateTime: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeStore(entriesPerFile: EntryRecord[][]): HarStore {
  const analyses: HarAnalysis[] = entriesPerFile.map((entries, i) => ({
    fileName: `f${i}.har`,
    fileIndex: i,
    totalRequests: entries.length,
    totalContentSize: 0,
    statusCodeCounts: {},
    contentTypeCounts: {},
    contentSizeBucketCounts: {},
    serverIPCounts: {},
    uniqueUrlCount: 0,
    entries,
  }));
  return { analyses };
}

// ---------------------------------------------------------------------------
// getEntryByPosition
// ---------------------------------------------------------------------------

describe("getEntryByPosition", () => {
  const e0 = makeEntry({ url: "https://a/0" });
  const e1 = makeEntry({ url: "https://a/1" });
  const store = makeStore([[e0, e1]]);

  it("returns the entry at the given position", () => {
    expect(getEntryByPosition(store, 0, 1)).toBe(e1);
  });

  it("returns null for an out-of-range index", () => {
    expect(getEntryByPosition(store, 0, 5)).toBeNull();
  });

  it("returns null for a missing file", () => {
    expect(getEntryByPosition(store, 7, 0)).toBeNull();
    expect(getEntryByPosition(null, 0, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findIndexInFile
// ---------------------------------------------------------------------------

describe("findIndexInFile", () => {
  const e0 = makeEntry({ url: "https://a/0" });
  const e1 = makeEntry({ url: "https://a/1" });
  const stray = makeEntry({ url: "https://x/" });
  const store = makeStore([[e0, e1]]);

  it("returns the index when the entry belongs to the file", () => {
    expect(findIndexInFile(store, 0, e1)).toBe(1);
  });

  it("returns null when the entry is from a different file", () => {
    expect(findIndexInFile(store, 0, stray)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// compareEntryToFile
// ---------------------------------------------------------------------------

describe("compareEntryToFile", () => {
  // Population (excluding the entry itself) of 10 times: 10, 20, ..., 100.
  // P50 = 50, P95 = 100, P99 = 100. Sizes: 1..10 KB; medianSize = 5120, p90Size = 9216.
  const population = Array.from({ length: 10 }, (_, i) =>
    makeEntry({ time: (i + 1) * 10, contentSize: (i + 1) * 1024 }),
  );

  it("ranks an entry below P50 as faster-than-p50", () => {
    const entry = makeEntry({ time: 30, contentSize: 1024 });
    const cmp = compareEntryToFile(entry, [...population, entry]);
    expect(cmp.timeRank).toBe("faster-than-p50");
    expect(cmp.sizeRank).toBe("below-median");
    expect(cmp.samples).toBe(10);
    expect(cmp.p50).toBe(50);
    expect(cmp.p95).toBe(100);
  });

  it("ranks an entry between P50 and P95 as between-p50-p95", () => {
    const entry = makeEntry({ time: 80, contentSize: 6 * 1024 });
    const cmp = compareEntryToFile(entry, [...population, entry]);
    expect(cmp.timeRank).toBe("between-p50-p95");
    expect(cmp.sizeRank).toBe("above-median");
  });

  it("ranks an entry above P95 (but at-or-below P99) as slower-than-p95", () => {
    // p95Time and p99Time both happen to equal 100 for this population, so
    // produce a P95 ranking by using a different population where P95 < P99.
    const wider = Array.from({ length: 100 }, (_, i) =>
      makeEntry({ time: i + 1 }),
    );
    const entry = makeEntry({ time: 97 });
    const cmp = compareEntryToFile(entry, [...wider, entry]);
    expect(cmp.timeRank).toBe("slower-than-p95");
  });

  it("ranks an entry above P99 as slower-than-p99 and oversize as top-decile", () => {
    const entry = makeEntry({ time: 1000, contentSize: 100 * 1024 });
    const cmp = compareEntryToFile(entry, [...population, entry]);
    expect(cmp.timeRank).toBe("slower-than-p99");
    expect(cmp.sizeRank).toBe("top-decile");
  });
});

// ---------------------------------------------------------------------------
// findHeader
// ---------------------------------------------------------------------------

describe("findHeader", () => {
  const headers = [
    { name: "Content-Type", value: "application/json" },
    { name: "X-Trace-Id", value: "abc-123" },
  ];

  it("returns the header value with a case-insensitive name match", () => {
    expect(findHeader(headers, "content-type")).toBe("application/json");
    expect(findHeader(headers, "X-TRACE-ID")).toBe("abc-123");
  });

  it("returns null when the header is absent", () => {
    expect(findHeader(headers, "authorization")).toBeNull();
  });

  it("returns the first match when duplicates are present", () => {
    const dup = [
      { name: "Set-Cookie", value: "a=1" },
      { name: "set-cookie", value: "b=2" },
    ];
    expect(findHeader(dup, "set-cookie")).toBe("a=1");
  });
});

// ---------------------------------------------------------------------------
// parseUrlQuery
// ---------------------------------------------------------------------------

describe("parseUrlQuery", () => {
  it("returns the query parameters in order", () => {
    expect(parseUrlQuery("https://example.com/x?a=1&b=two&a=3")).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "two" },
      { name: "a", value: "3" },
    ]);
  });

  it("returns an empty list when the URL has no query string", () => {
    expect(parseUrlQuery("https://example.com/x")).toEqual([]);
  });

  it("returns an empty list for an unparseable URL", () => {
    expect(parseUrlQuery("not a url")).toEqual([]);
  });

  it("decodes percent-encoded values", () => {
    expect(parseUrlQuery("https://example.com/?q=hello%20world")).toEqual([
      { name: "q", value: "hello world" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// throughputKBps
// ---------------------------------------------------------------------------

describe("throughputKBps", () => {
  it("computes KB/s from contentSize and receive ms", () => {
    const entry = makeEntry({
      contentSize: 102_400,
      timings: { send: 0, wait: 0, receive: 1000 },
    });
    expect(throughputKBps(entry)).toBeCloseTo(100, 5);
  });

  it("returns null when receive is the HAR -1 sentinel", () => {
    const entry = makeEntry({
      contentSize: 1024,
      timings: { send: 0, wait: 0, receive: -1 },
    });
    expect(throughputKBps(entry)).toBeNull();
  });

  it("returns null when contentSize is zero", () => {
    const entry = makeEntry({
      contentSize: 0,
      timings: { send: 0, wait: 0, receive: 100 },
    });
    expect(throughputKBps(entry)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reusedConnection
// ---------------------------------------------------------------------------

describe("reusedConnection", () => {
  it("returns true when both dns and connect are -1 (HAR N/A)", () => {
    expect(
      reusedConnection({ dns: -1, connect: -1, send: 0, wait: 5, receive: 5 }),
    ).toBe(true);
  });

  it("returns true when both dns and connect are 0", () => {
    expect(
      reusedConnection({ dns: 0, connect: 0, send: 0, wait: 5, receive: 5 }),
    ).toBe(true);
  });

  it("returns false when a fresh connection was dialed", () => {
    expect(
      reusedConnection({ dns: 12, connect: 20, send: 0, wait: 5, receive: 5 }),
    ).toBe(false);
  });

  it("returns false when only one of dns or connect is non-zero", () => {
    expect(
      reusedConnection({ dns: 0, connect: 20, send: 0, wait: 5, receive: 5 }),
    ).toBe(false);
    expect(
      reusedConnection({ dns: 12, connect: 0, send: 0, wait: 5, receive: 5 }),
    ).toBe(false);
  });
});
