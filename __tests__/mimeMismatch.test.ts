import { describe, it, expect } from "vitest";
import {
  urlExtension,
  expectedMimesForExtension,
  isKnownExtension,
  analyzeMimeMismatch,
  analyzeStore,
  visibleMismatchEntries,
} from "@/utils/mimeMismatch";
import type { EntryRecord } from "@/types/har";

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    harFileIndex: 0,
    harFileName: "a.har",
    indexInFile: 0,
    url: "https://example.com/data.json",
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

describe("urlExtension", () => {
  it("extracts pathname extension ignoring query", () => {
    expect(urlExtension("https://host/app.json?foo=1")).toBe("json");
    expect(urlExtension("https://host/foo.min.js")).toBe("js");
  });

  it("returns null when no extension", () => {
    expect(urlExtension("https://host/api/users")).toBeNull();
    expect(urlExtension("https://host/")).toBeNull();
  });
});

describe("analyzeMimeMismatch", () => {
  it("flags .json with text/html", () => {
    const finding = analyzeMimeMismatch(
      makeEntry({
        url: "https://example.com/api.json",
        contentType: "text/html",
      }),
    );
    expect(finding?.kind).toBe("mismatch");
    expect(finding?.expectedTypes).toContain("application/json");
  });

  it("accepts equivalent JS MIME types", () => {
    expect(
      analyzeMimeMismatch(
        makeEntry({
          url: "https://example.com/app.js",
          contentType: "text/javascript",
        }),
      ),
    ).toBeNull();
    expect(
      analyzeMimeMismatch(
        makeEntry({
          url: "https://example.com/app.js",
          contentType: "application/javascript",
        }),
      ),
    ).toBeNull();
  });

  it("returns unverified for unknown extension", () => {
    const finding = analyzeMimeMismatch(
      makeEntry({
        url: "https://example.com/page.aspx",
        contentType: "text/html",
      }),
    );
    expect(finding?.kind).toBe("unverified");
    expect(finding?.expectedTypes).toEqual([]);
  });

  it("skips URLs without extension", () => {
    expect(
      analyzeMimeMismatch(
        makeEntry({ url: "https://example.com/api/foo" }),
      ),
    ).toBeNull();
  });

  it("skips unknown content type", () => {
    expect(
      analyzeMimeMismatch(
        makeEntry({ contentType: "unknown" }),
      ),
    ).toBeNull();
  });
});

describe("analyzeStore and visibility", () => {
  it("aggregates mismatch and unverified counts", () => {
    const report = analyzeStore([
      {
        fileName: "a.har",
        fileIndex: 0,
        totalRequests: 3,
        totalContentSize: 0,
        statusCodeCounts: {},
        methodCounts: {},
        contentTypeCounts: {},
        contentSizeBucketCounts: {},
        serverIPCounts: {},
        uniqueUrlCount: 3,
        entries: [
          makeEntry({
            indexInFile: 0,
            url: "https://example.com/a.json",
            contentType: "text/html",
          }),
          makeEntry({
            indexInFile: 1,
            url: "https://example.com/b.json",
            contentType: "application/json",
          }),
          makeEntry({
            indexInFile: 2,
            url: "https://example.com/c.aspx",
            contentType: "text/html",
          }),
        ],
      },
    ]);
    expect(report.mismatchCount).toBe(1);
    expect(report.unverifiedCount).toBe(1);
    expect(visibleMismatchEntries(report, false).length).toBe(1);
    expect(visibleMismatchEntries(report, true).length).toBe(2);
  });
});

describe("isKnownExtension", () => {
  it("knows json and not aspx", () => {
    expect(isKnownExtension("json")).toBe(true);
    expect(isKnownExtension("aspx")).toBe(false);
    expect(expectedMimesForExtension("json")).toContain("application/json");
  });
});
