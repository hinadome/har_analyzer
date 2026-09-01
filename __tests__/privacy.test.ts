import { describe, expect, it } from "vitest";
import type { EntryRecord, HarAnalysis } from "@/types/har";
import {
  REDACTED,
  isSensitiveHeaderName,
  redactAnalysis,
  redactEntry,
  redactHeaders,
  redactUrl,
} from "@/utils/privacy";

function entry(partial: Partial<EntryRecord> = {}): EntryRecord {
  return {
    url: "https://example.com/api",
    method: "GET",
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    contentSize: 0,
    bodySize: 0,
    time: 1,
    timings: { send: 0, wait: 1, receive: 0 },
    harFileName: "a.har",
    harFileIndex: 0,
    requestHeaders: [],
    responseHeaders: [],
    requestCookies: [],
    responseCookies: [],
    serverIPAddress: "",
    userAgent: "",
    startedDateTime: "",
    ...partial,
  };
}

describe("isSensitiveHeaderName", () => {
  it("matches Authorization / Cookie / Set-Cookie case-insensitively", () => {
    expect(isSensitiveHeaderName("Authorization")).toBe(true);
    expect(isSensitiveHeaderName("cookie")).toBe(true);
    expect(isSensitiveHeaderName("SET-COOKIE")).toBe(true);
    expect(isSensitiveHeaderName("Content-Type")).toBe(false);
  });
});

describe("redactHeaders", () => {
  it("masks sensitive values and leaves others", () => {
    const out = redactHeaders([
      { name: "Authorization", value: "Bearer secret" },
      { name: "Accept", value: "application/json" },
      { name: "Cookie", value: "sid=abc" },
    ]);
    expect(out[0].value).toBe(REDACTED);
    expect(out[1].value).toBe("application/json");
    expect(out[2].value).toBe(REDACTED);
  });
});

describe("redactUrl", () => {
  it("masks known token query params", () => {
    const out = redactUrl(
      "https://api.example.com/cb?code=ok&access_token=xyz&q=1",
    );
    expect(out).toContain(`access_token=${encodeURIComponent(REDACTED)}`);
    expect(out).toContain("code=ok");
    expect(out).toContain("q=1");
  });

  it("leaves URLs without query strings unchanged", () => {
    expect(redactUrl("https://example.com/path")).toBe(
      "https://example.com/path",
    );
  });
});

describe("redactEntry / redactAnalysis", () => {
  it("redacts headers, cookies, and URL params", () => {
    const e = redactEntry(
      entry({
        url: "https://x.test/?api_key=sekrit",
        requestHeaders: [{ name: "Authorization", value: "Bearer x" }],
        responseHeaders: [{ name: "Set-Cookie", value: "a=1; Path=/" }],
        requestCookies: [{ name: "session", value: "abc" }],
        responseCookies: [{ name: "a", value: "1" }],
      }),
    );
    expect(e.url).toContain(`api_key=${encodeURIComponent(REDACTED)}`);
    expect(e.requestHeaders[0].value).toBe(REDACTED);
    expect(e.responseHeaders[0].value).toBe(REDACTED);
    expect(e.requestCookies[0].value).toBe(REDACTED);
    expect(e.responseCookies[0].value).toBe(REDACTED);
  });

  it("strips response bodies from redacted entries", () => {
    const e = redactEntry(
      entry({
        responseContent: '{"token":"secret"}',
        hasResponseBody: true,
        bodyId: "body-1",
      }),
    );
    expect(e.responseContent).toBeUndefined();
    expect(e.bodyId).toBeUndefined();
    expect(e.hasResponseBody).toBe(false);
  });

  it("maps every entry in an analysis", () => {
    const analysis: HarAnalysis = {
      fileName: "a.har",
      fileIndex: 0,
      totalRequests: 1,
      totalContentSize: 0,
      statusCodeCounts: {},
      methodCounts: {},
      contentTypeCounts: {},
      contentSizeBucketCounts: {},
      serverIPCounts: {},
      uniqueUrlCount: 1,
      entries: [
        entry({
          requestHeaders: [{ name: "Cookie", value: "x=1" }],
        }),
      ],
    };
    const out = redactAnalysis(analysis);
    expect(out.entries[0].requestHeaders[0].value).toBe(REDACTED);
  });
});
