/**
 * Tests for utils/corsAnalysis.ts
 * Covers: getHeader, splitCsv, isCrossOrigin, isPreflight, isCredentialed,
 *         pairPreflights, analyzeEntry (all 9 finding kinds), analyzeStore.
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import {
  getHeader,
  splitCsv,
  isCrossOrigin,
  isPreflight,
  isCredentialed,
  pairPreflights,
  analyzeStore,
  corsEntryId,
  PREFLIGHT_SLOW_MS,
  type CorsEntry,
} from "@/utils/corsAnalysis";
import type { EntryRecord, HarAnalysis, HarHeader } from "@/types/har";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_ORIGIN = "https://app.y.com";
const API_URL = "https://api.x.com/v1/users";

function h(name: string, value: string): HarHeader {
  return { name, value };
}

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    url: API_URL,
    method: "GET",
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    contentSize: 0,
    bodySize: 0,
    time: 50,
    timings: { send: 1, wait: 40, receive: 9 },
    harFileName: "a.har",
    harFileIndex: 0,
    requestHeaders: [h("Origin", APP_ORIGIN)],
    responseHeaders: [],
    requestCookies: [],
    responseCookies: [],
    serverIPAddress: "",
    userAgent: "",
    startedDateTime: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePreflight(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return makeEntry({
    method: "OPTIONS",
    status: 204,
    requestHeaders: [
      h("Origin", APP_ORIGIN),
      h("Access-Control-Request-Method", "PUT"),
      h("Access-Control-Request-Headers", "authorization, x-api-key"),
    ],
    ...overrides,
  });
}

function makeAnalysis(entries: EntryRecord[]): HarAnalysis {
  return {
    fileName: "test.har",
    fileIndex: 0,
    totalRequests: entries.length,
    totalContentSize: 0,
    statusCodeCounts: {},
    contentTypeCounts: {},
    contentSizeBucketCounts: {},
    serverIPCounts: {},
    uniqueUrlCount: entries.length,
    entries,
  };
}

function findingsFor(
  analysis: HarAnalysis,
  predicate: (ce: CorsEntry) => boolean,
) {
  const r = analyzeStore([analysis]);
  const ce = r.files[0].entries.find(predicate);
  return ce?.findings.map((f) => f.kind) ?? [];
}

// ---------------------------------------------------------------------------
// getHeader / splitCsv
// ---------------------------------------------------------------------------

describe("getHeader", () => {
  it("is case-insensitive", () => {
    const headers = [h("CONTENT-type", "application/json")];
    expect(getHeader(headers, "content-type")).toBe("application/json");
  });
  it("joins multi-value occurrences with ', '", () => {
    const headers = [h("set-cookie", "a=1"), h("Set-Cookie", "b=2")];
    expect(getHeader(headers, "set-cookie")).toBe("a=1, b=2");
  });
  it("returns undefined when missing", () => {
    expect(getHeader([], "x")).toBeUndefined();
  });
});

describe("splitCsv", () => {
  it("trims tokens and lowercases them", () => {
    expect(splitCsv("GET ,  POST,put")).toEqual(["get", "post", "put"]);
  });
  it("returns [] for undefined / empty", () => {
    expect(splitCsv(undefined)).toEqual([]);
    expect(splitCsv("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe("isCrossOrigin", () => {
  it("true when Origin differs from request URL origin", () => {
    expect(isCrossOrigin(makeEntry())).toBe(true);
  });
  it("false when same-origin", () => {
    const e = makeEntry({ url: `${APP_ORIGIN}/path` });
    expect(isCrossOrigin(e)).toBe(false);
  });
  it("false when Origin header is absent", () => {
    const e = makeEntry({ requestHeaders: [] });
    expect(isCrossOrigin(e)).toBe(false);
  });
  it("treats Origin: null as cross-origin", () => {
    const e = makeEntry({ requestHeaders: [h("Origin", "null")] });
    expect(isCrossOrigin(e)).toBe(true);
  });
});

describe("isPreflight", () => {
  it("true for OPTIONS with ACRM", () => {
    expect(isPreflight(makePreflight())).toBe(true);
  });
  it("false for OPTIONS without ACRM", () => {
    expect(
      isPreflight(makeEntry({ method: "OPTIONS", requestHeaders: [] })),
    ).toBe(false);
  });
  it("false for non-OPTIONS", () => {
    expect(isPreflight(makeEntry())).toBe(false);
  });
});

describe("isCredentialed", () => {
  it("true when Cookie present", () => {
    const e = makeEntry({
      requestHeaders: [h("Origin", APP_ORIGIN), h("Cookie", "sid=abc")],
    });
    expect(isCredentialed(e)).toBe(true);
  });
  it("true when Authorization present", () => {
    const e = makeEntry({
      requestHeaders: [h("Origin", APP_ORIGIN), h("authorization", "Bearer x")],
    });
    expect(isCredentialed(e)).toBe(true);
  });
  it("false otherwise", () => {
    expect(isCredentialed(makeEntry())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

describe("pairPreflights", () => {
  it("pairs OPTIONS with the matching actual within the time window", () => {
    const pf = makePreflight({
      startedDateTime: "2025-01-01T00:00:00.000Z",
    });
    const actual = makeEntry({
      method: "PUT",
      startedDateTime: "2025-01-01T00:00:00.200Z",
    });
    const r = analyzeStore([makeAnalysis([pf, actual])]);
    expect(r.files[0].pairs).toHaveLength(1);
    expect(r.files[0].pairs[0].actual).not.toBeNull();
    expect(r.files[0].pairs[0].actual?.entry.method).toBe("PUT");
  });

  it("does not pair across the time window", () => {
    const pf = makePreflight({
      startedDateTime: "2025-01-01T00:00:00.000Z",
    });
    const actual = makeEntry({
      method: "PUT",
      startedDateTime: "2025-01-01T00:00:10.000Z",
    });
    const r = analyzeStore([makeAnalysis([pf, actual])]);
    expect(r.files[0].pairs[0].actual).toBeNull();
  });

  it("does not pair when method differs", () => {
    const pf = makePreflight({
      startedDateTime: "2025-01-01T00:00:00.000Z",
    });
    const actual = makeEntry({
      method: "POST",
      startedDateTime: "2025-01-01T00:00:00.200Z",
    });
    const r = analyzeStore([makeAnalysis([pf, actual])]);
    expect(r.files[0].pairs[0].actual).toBeNull();
  });

  it("each actual is consumed by at most one preflight", () => {
    const pf1 = makePreflight({
      startedDateTime: "2025-01-01T00:00:00.000Z",
    });
    const pf2 = makePreflight({
      startedDateTime: "2025-01-01T00:00:00.100Z",
    });
    const actual = makeEntry({
      method: "PUT",
      startedDateTime: "2025-01-01T00:00:00.200Z",
    });
    const r = analyzeStore([makeAnalysis([pf1, pf2, actual])]);
    const matched = r.files[0].pairs.filter((p) => p.actual !== null);
    expect(matched).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Findings \u2014 one positive + one negative case per kind
// ---------------------------------------------------------------------------

describe("finding: preflight-failed", () => {
  it("triggers on OPTIONS status 403", () => {
    const pf = makePreflight({ status: 403 });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).toContain(
      "preflight-failed",
    );
  });
  it("triggers on OPTIONS status 0", () => {
    const pf = makePreflight({ status: 0 });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).toContain(
      "preflight-failed",
    );
  });
  it("does not trigger on 204", () => {
    const pf = makePreflight({
      status: 204,
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "PUT"),
        h("Access-Control-Allow-Headers", "authorization, x-api-key"),
      ],
    });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).not.toContain(
      "preflight-failed",
    );
  });
});

describe("finding: preflight-slow", () => {
  it("triggers above threshold", () => {
    const pf = makePreflight({
      time: PREFLIGHT_SLOW_MS + 1,
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "PUT"),
        h("Access-Control-Allow-Headers", "authorization, x-api-key"),
      ],
    });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).toContain(
      "preflight-slow",
    );
  });
  it("does not trigger at threshold", () => {
    const pf = makePreflight({
      time: PREFLIGHT_SLOW_MS,
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "PUT"),
        h("Access-Control-Allow-Headers", "authorization, x-api-key"),
      ],
    });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).not.toContain(
      "preflight-slow",
    );
  });
});

describe("finding: acao-missing", () => {
  it("triggers on cross-origin response without ACAO", () => {
    const e = makeEntry({ responseHeaders: [] });
    expect(findingsFor(makeAnalysis([e]), () => true)).toContain(
      "acao-missing",
    );
  });
  it("does not trigger when ACAO is present and matches", () => {
    const e = makeEntry({
      responseHeaders: [h("Access-Control-Allow-Origin", APP_ORIGIN)],
    });
    expect(findingsFor(makeAnalysis([e]), () => true)).not.toContain(
      "acao-missing",
    );
  });
});

describe("finding: acao-mismatch", () => {
  it("triggers when ACAO is a literal origin that differs", () => {
    const e = makeEntry({
      responseHeaders: [
        h("Access-Control-Allow-Origin", "https://other.z.com"),
      ],
    });
    expect(findingsFor(makeAnalysis([e]), () => true)).toContain(
      "acao-mismatch",
    );
  });
  it("does not trigger when ACAO matches Origin", () => {
    const e = makeEntry({
      responseHeaders: [h("Access-Control-Allow-Origin", APP_ORIGIN)],
    });
    expect(findingsFor(makeAnalysis([e]), () => true)).not.toContain(
      "acao-mismatch",
    );
  });
  it("does not trigger when ACAO is *", () => {
    const e = makeEntry({
      responseHeaders: [h("Access-Control-Allow-Origin", "*")],
    });
    expect(findingsFor(makeAnalysis([e]), () => true)).not.toContain(
      "acao-mismatch",
    );
  });
});

describe("finding: acao-wildcard-with-credentials", () => {
  it("triggers when ACAO=* and request has Cookie", () => {
    const e = makeEntry({
      requestHeaders: [h("Origin", APP_ORIGIN), h("Cookie", "sid=abc")],
      responseHeaders: [h("Access-Control-Allow-Origin", "*")],
    });
    expect(findingsFor(makeAnalysis([e]), () => true)).toContain(
      "acao-wildcard-with-credentials",
    );
  });
  it("does not trigger when ACAO=* without credentials", () => {
    const e = makeEntry({
      responseHeaders: [h("Access-Control-Allow-Origin", "*")],
    });
    expect(findingsFor(makeAnalysis([e]), () => true)).not.toContain(
      "acao-wildcard-with-credentials",
    );
  });
});

describe("finding: method-not-allowed", () => {
  it("triggers when ACRM not in Access-Control-Allow-Methods", () => {
    const pf = makePreflight({
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "GET, POST"),
        h("Access-Control-Allow-Headers", "authorization, x-api-key"),
      ],
    });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).toContain(
      "method-not-allowed",
    );
  });
  it("does not trigger with comma-spaced match", () => {
    const pf = makePreflight({
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "GET ,  PUT"),
        h("Access-Control-Allow-Headers", "authorization, x-api-key"),
      ],
    });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).not.toContain(
      "method-not-allowed",
    );
  });
  it("does not trigger when allow-methods is *", () => {
    const pf = makePreflight({
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "*"),
        h("Access-Control-Allow-Headers", "authorization, x-api-key"),
      ],
    });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).not.toContain(
      "method-not-allowed",
    );
  });
});

describe("finding: header-not-allowed", () => {
  it("triggers when ACRH has a header missing from ACAH", () => {
    const pf = makePreflight({
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "PUT"),
        h("Access-Control-Allow-Headers", "authorization"),
      ],
    });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).toContain(
      "header-not-allowed",
    );
  });
  it("does not trigger when ACAH covers all (case-insensitive)", () => {
    const pf = makePreflight({
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "PUT"),
        h("Access-Control-Allow-Headers", "Authorization, X-API-Key"),
      ],
    });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).not.toContain(
      "header-not-allowed",
    );
  });
  it("does not trigger when ACAH is *", () => {
    const pf = makePreflight({
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "PUT"),
        h("Access-Control-Allow-Headers", "*"),
      ],
    });
    expect(findingsFor(makeAnalysis([pf]), (c) => c.isPreflight)).not.toContain(
      "header-not-allowed",
    );
  });
});

describe("finding: credentials-flag-missing", () => {
  it("triggers when actual request has Cookie but ACAC missing", () => {
    const e = makeEntry({
      requestHeaders: [h("Origin", APP_ORIGIN), h("Cookie", "sid=abc")],
      responseHeaders: [h("Access-Control-Allow-Origin", APP_ORIGIN)],
    });
    expect(findingsFor(makeAnalysis([e]), () => true)).toContain(
      "credentials-flag-missing",
    );
  });
  it("does not trigger when ACAC: true is present", () => {
    const e = makeEntry({
      requestHeaders: [h("Origin", APP_ORIGIN), h("Cookie", "sid=abc")],
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Credentials", "true"),
      ],
    });
    expect(findingsFor(makeAnalysis([e]), () => true)).not.toContain(
      "credentials-flag-missing",
    );
  });
});

describe("finding: actual-request-blocked", () => {
  it("triggers on actual request paired with a failed preflight", () => {
    const pf = makePreflight({
      status: 403,
      startedDateTime: "2025-01-01T00:00:00.000Z",
    });
    const actual = makeEntry({
      method: "PUT",
      status: 0,
      startedDateTime: "2025-01-01T00:00:00.200Z",
    });
    const r = analyzeStore([makeAnalysis([pf, actual])]);
    const actualCe = r.files[0].entries.find((c) => !c.isPreflight)!;
    expect(actualCe.findings.map((f) => f.kind)).toContain(
      "actual-request-blocked",
    );
  });
  it("does not trigger when preflight succeeded", () => {
    const pf = makePreflight({
      status: 204,
      startedDateTime: "2025-01-01T00:00:00.000Z",
      responseHeaders: [
        h("Access-Control-Allow-Origin", APP_ORIGIN),
        h("Access-Control-Allow-Methods", "PUT"),
        h("Access-Control-Allow-Headers", "authorization, x-api-key"),
      ],
    });
    const actual = makeEntry({
      method: "PUT",
      status: 200,
      startedDateTime: "2025-01-01T00:00:00.200Z",
      responseHeaders: [h("Access-Control-Allow-Origin", APP_ORIGIN)],
    });
    const r = analyzeStore([makeAnalysis([pf, actual])]);
    const actualCe = r.files[0].entries.find((c) => !c.isPreflight)!;
    expect(actualCe.findings.map((f) => f.kind)).not.toContain(
      "actual-request-blocked",
    );
  });
});

// ---------------------------------------------------------------------------
// analyzeStore aggregation + corsEntryId
// ---------------------------------------------------------------------------

describe("analyzeStore", () => {
  it("excludes same-origin requests entirely", () => {
    const sameOrigin = makeEntry({
      url: `${APP_ORIGIN}/path`,
    });
    const r = analyzeStore([makeAnalysis([sameOrigin])]);
    expect(r.files[0].entries).toHaveLength(0);
    expect(r.crossOriginCount).toBe(0);
  });

  it("aggregates counts across files", () => {
    const bad = makeEntry({ responseHeaders: [] });
    const good = makeEntry({
      responseHeaders: [h("Access-Control-Allow-Origin", APP_ORIGIN)],
    });
    const r = analyzeStore([makeAnalysis([bad]), makeAnalysis([good])]);
    expect(r.crossOriginCount).toBe(2);
    expect(r.errorCount).toBeGreaterThanOrEqual(1);
    expect(r.files).toHaveLength(2);
  });

  it("counts failed preflights separately", () => {
    const pf = makePreflight({ status: 500 });
    const r = analyzeStore([makeAnalysis([pf])]);
    expect(r.failedPreflightCount).toBe(1);
    expect(r.preflightCount).toBe(1);
  });
});

describe("corsEntryId", () => {
  it("returns `${fileIndex}:${entryIndex}`", () => {
    const e = makeEntry({ responseHeaders: [] });
    const r = analyzeStore([makeAnalysis([e])]);
    expect(corsEntryId(r.files[0].entries[0])).toBe("0:0");
  });
});
