import { describe, it, expect } from "vitest";
import {
  parseEtag,
  parseLastModified,
  analyzeStore,
  scopedPathGroups,
} from "@/utils/cacheValidator";
import type { EntryRecord, HarAnalysis } from "@/types/har";

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    harFileIndex: 0,
    harFileName: "a.har",
    indexInFile: 0,
    url: "https://example.com/static/app.js",
    method: "GET",
    status: 200,
    contentType: "text/javascript",
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

function makeAnalysis(
  entries: EntryRecord[],
  fileIndex = 0,
  fileName = "a.har",
): HarAnalysis {
  return {
    fileIndex,
    fileName,
    totalRequests: entries.length,
    totalContentSize: entries.reduce((n, e) => n + e.contentSize, 0),
    statusCodeCounts: { 200: entries.length },
    uniqueUrlCount: entries.length,
    entries,
  };
}

describe("parseEtag", () => {
  it("parses strong quoted ETag", () => {
    const etag = parseEtag('"abc123"');
    expect(etag?.weak).toBe(false);
    expect(etag?.value).toBe("abc123");
    expect(etag?.key).toBe("S:abc123");
  });

  it("parses weak ETag with distinct key from strong", () => {
    const weak = parseEtag('W/"abc123"');
    const strong = parseEtag('"abc123"');
    expect(weak?.weak).toBe(true);
    expect(weak?.key).toBe("W:abc123");
    expect(strong?.key).toBe("S:abc123");
    expect(weak?.key).not.toBe(strong?.key);
  });

  it("treats different values as different keys", () => {
    const a = parseEtag('"v1"');
    const b = parseEtag('W/"v2"');
    expect(a?.key).not.toBe(b?.key);
  });
});

describe("parseLastModified", () => {
  it("normalizes parseable dates to distinct keys", () => {
    const a = parseLastModified("Wed, 01 Jan 2026 00:00:00 GMT");
    const b = parseLastModified("Thu, 02 Jan 2026 00:00:00 GMT");
    expect(a?.key).not.toBe(b?.key);
  });
});

describe("analyzeStore", () => {
  it("flags same pathname with different ETags", () => {
    const entries = [
      makeEntry({
        indexInFile: 0,
        url: "https://cdn.example.com/app.js?v=1",
        responseHeaders: [{ name: "ETag", value: '"a"' }],
      }),
      makeEntry({
        indexInFile: 1,
        url: "https://cdn.example.com/app.js?v=2",
        responseHeaders: [{ name: "ETag", value: '"b"' }],
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.pathConflictCount).toBe(1);
    expect(report.groups[0].kind).toBe("etag");
    expect(report.groups[0].distinctEtags.length).toBe(2);
  });

  it("flags weak vs strong with same value as drift", () => {
    const entries = [
      makeEntry({
        indexInFile: 0,
        responseHeaders: [{ name: "ETag", value: '"same"' }],
      }),
      makeEntry({
        indexInFile: 1,
        url: "https://example.com/static/app.js?other=1",
        responseHeaders: [{ name: "ETag", value: 'W/"same"' }],
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.pathConflictCount).toBe(1);
    expect(report.groups[0].distinctEtags.some((e) => e.weak)).toBe(true);
    expect(report.groups[0].distinctEtags.some((e) => !e.weak)).toBe(true);
  });

  it("groups across files when all scope", () => {
    const a = makeAnalysis(
      [
        makeEntry({
          responseHeaders: [{ name: "ETag", value: '"v1"' }],
        }),
      ],
      0,
      "before.har",
    );
    const b = makeAnalysis(
      [
        makeEntry({
          responseHeaders: [{ name: "ETag", value: '"v2"' }],
        }),
      ],
      1,
      "after.har",
    );
    const report = analyzeStore([a, b]);
    expect(report.pathConflictCount).toBe(1);
    expect(report.groups[0].entries.length).toBe(2);
  });

  it("scopes per file", () => {
    const a = makeAnalysis(
      [
        makeEntry({
          responseHeaders: [{ name: "ETag", value: '"v1"' }],
        }),
      ],
      0,
    );
    const b = makeAnalysis(
      [
        makeEntry({
          responseHeaders: [{ name: "ETag", value: '"v2"' }],
        }),
      ],
      1,
    );
    const report = analyzeStore([a, b]);
    expect(scopedPathGroups(report, 0).length).toBe(0);
    expect(scopedPathGroups(report, 1).length).toBe(0);
    expect(scopedPathGroups(report, "all").length).toBe(1);
  });

  it("tracks no-validator paths separately", () => {
    const entries = [
      makeEntry({ indexInFile: 0, url: "https://example.com/api/foo" }),
      makeEntry({
        indexInFile: 1,
        url: "https://example.com/api/foo?q=1",
      }),
    ];
    const report = analyzeStore([makeAnalysis(entries)]);
    expect(report.pathConflictCount).toBe(0);
    expect(report.noValidatorPathCount).toBe(1);
    expect(report.noValidatorGroups[0].pathname).toBe("/api/foo");
  });
});
