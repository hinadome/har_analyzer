/**
 * Tests for utils/kvSearch.ts
 * Covers: compileMatcher (contains/exact/regex), searchEntries (scope mask,
 *         AND-within-pair, case sensitivity, invalid regex, summary),
 *         parseScopeParam / serializeScopeParam.
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import {
  compileMatcher,
  searchEntries,
  parseScopeParam,
  serializeScopeParam,
  KV_LOCATIONS,
  type KvLocation,
  type KvSearchQuery,
} from "@/utils/kvSearch";
import type { EntryRecord, HarHeader } from "@/types/har";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function h(name: string, value: string): HarHeader {
  return { name, value };
}

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    url: "https://api.example.com/v1/users",
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
    requestHeaders: [],
    responseHeaders: [],
    requestCookies: [],
    responseCookies: [],
    serverIPAddress: "",
    userAgent: "",
    startedDateTime: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const FULL_SCOPE = new Set<KvLocation>(KV_LOCATIONS);

function q(overrides: Partial<KvSearchQuery> = {}): KvSearchQuery {
  return {
    name: "",
    value: "",
    scope: FULL_SCOPE,
    mode: "contains",
    caseSensitive: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// compileMatcher
// ---------------------------------------------------------------------------

describe("compileMatcher", () => {
  it("returns kind=any for an empty needle", () => {
    expect(compileMatcher("", "contains", false).kind).toBe("any");
    expect(compileMatcher("", "exact", false).kind).toBe("any");
    expect(compileMatcher("", "regex", false).kind).toBe("any");
  });

  it("contains mode finds every occurrence (case-insensitive by default)", () => {
    const m = compileMatcher("er", "contains", false);
    if (m.kind !== "match") throw new Error("expected match");
    // "ServER-eRror" lower-cases to "server-error"; "er" appears at 1, 4, 7.
    expect(m.run("ServER-eRror")).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 6 },
      { start: 7, end: 9 },
    ]);
  });

  it("contains mode respects caseSensitive=true", () => {
    const m = compileMatcher("ER", "contains", true);
    if (m.kind !== "match") throw new Error("expected match");
    expect(m.run("user-AGENT-ER")).toEqual([{ start: 11, end: 13 }]);
    expect(m.run("user-agent")).toBeNull();
  });

  it("exact mode matches whole string only and returns full range", () => {
    const m = compileMatcher("authorization", "exact", false);
    if (m.kind !== "match") throw new Error("expected match");
    expect(m.run("Authorization")).toEqual([{ start: 0, end: 13 }]);
    expect(m.run("Authorization-Type")).toBeNull();
  });

  it("regex mode finds all matches with the right ranges", () => {
    const m = compileMatcher("^x-[a-z]+", "regex", false);
    if (m.kind !== "match") throw new Error("expected match");
    expect(m.run("x-trace-id")).toEqual([{ start: 0, end: 7 }]);
    expect(m.run("X-Trace-Id")).toEqual([{ start: 0, end: 7 }]);
    expect(m.run("not-x-trace")).toBeNull();
  });

  it("regex mode returns kind=error on invalid pattern (no throw)", () => {
    const m = compileMatcher("[unclosed", "regex", false);
    expect(m.kind).toBe("error");
  });

  it("regex mode does not loop on zero-width matches", () => {
    const m = compileMatcher("a*", "regex", false);
    if (m.kind !== "match") throw new Error("expected match");
    // Should terminate; we don't assert exact ranges (engines differ on counts
    // for zero-width matches), only that the call returns.
    const ranges = m.run("aaa");
    expect(ranges).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// searchEntries — scope + basic semantics
// ---------------------------------------------------------------------------

describe("searchEntries — scope and basic semantics", () => {
  it("returns empty when both name and value are empty (no filter)", () => {
    const e = makeEntry({ requestHeaders: [h("Authorization", "Bearer x")] });
    const out = searchEntries([e], q());
    expect(out.hits).toHaveLength(0);
    expect(out.summary.totalHits).toBe(0);
  });

  it("returns empty when scope is empty", () => {
    const e = makeEntry({ requestHeaders: [h("Authorization", "Bearer x")] });
    const out = searchEntries(
      [e],
      q({ name: "Authorization", scope: new Set() }),
    );
    expect(out.hits).toHaveLength(0);
  });
});

describe("searchEntries — name and value matching", () => {
  it("name-only filter matches by header name across all four scopes", () => {
    const e = makeEntry({
      requestHeaders: [h("Authorization", "Bearer abc")],
      responseHeaders: [h("Content-Type", "application/json")],
      requestCookies: [{ name: "sessionid", value: "s1" }],
      responseCookies: [{ name: "csrftoken", value: "t1" }],
    });
    const out = searchEntries([e], q({ name: "auth" }));
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].matches).toHaveLength(1);
    expect(out.hits[0].matches[0]).toMatchObject({
      location: "request-header",
      name: "Authorization",
    });
    expect(out.hits[0].matches[0].nameRanges).toEqual([{ start: 0, end: 4 }]);
    expect(out.hits[0].matches[0].valueRanges).toEqual([]);
  });

  it("value-only filter matches by header value and leaves name ranges empty", () => {
    const e = makeEntry({
      requestHeaders: [h("Authorization", "Bearer abc123")],
    });
    const out = searchEntries([e], q({ value: "Bearer" }));
    expect(out.hits[0].matches[0].nameRanges).toEqual([]);
    expect(out.hits[0].matches[0].valueRanges).toEqual([{ start: 0, end: 6 }]);
  });

  it("AND-within-pair: both name and value must match the same pair", () => {
    const e = makeEntry({
      requestHeaders: [
        h("Authorization", "Basic abc"),
        h("X-Token", "Bearer xyz"),
      ],
    });
    const out = searchEntries(
      [e],
      q({ name: "Authorization", value: "Bearer" }),
    );
    expect(out.hits).toHaveLength(0);
  });

  it("AND-within-pair matches when both sides hit the same pair", () => {
    const e = makeEntry({
      requestHeaders: [
        h("Authorization", "Bearer abc"),
        h("X-Token", "secret"),
      ],
    });
    const out = searchEntries(
      [e],
      q({ name: "Authorization", value: "Bearer" }),
    );
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].matches).toHaveLength(1);
    expect(out.hits[0].matches[0].name).toBe("Authorization");
  });

  it("scope mask excludes locations not in the set", () => {
    const e = makeEntry({
      requestHeaders: [h("X-Foo", "1")],
      responseHeaders: [h("X-Foo", "2")],
    });
    const out = searchEntries(
      [e],
      q({ name: "X-Foo", scope: new Set(["response-header"]) }),
    );
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].matches).toHaveLength(1);
    expect(out.hits[0].matches[0].location).toBe("response-header");
  });

  it("a single entry can produce multiple matches across locations", () => {
    const e = makeEntry({
      requestHeaders: [h("X-Trace", "abc"), h("X-Span", "def")],
      responseHeaders: [h("X-Trace-Id", "xyz")],
    });
    const out = searchEntries([e], q({ name: "x-trace" }));
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].matches).toHaveLength(2);
    expect(out.summary.totalMatches).toBe(2);
    expect(out.summary.perLocation["request-header"]).toBe(1);
    expect(out.summary.perLocation["response-header"]).toBe(1);
  });
});

describe("searchEntries — case sensitivity", () => {
  it("default (caseSensitive=false) matches headers regardless of case", () => {
    const e = makeEntry({
      requestHeaders: [h("Authorization", "Bearer abc")],
    });
    const out = searchEntries([e], q({ name: "AUTHORIZATION" }));
    expect(out.hits).toHaveLength(1);
  });

  it("caseSensitive=true rejects mis-cased header names", () => {
    const e = makeEntry({
      requestHeaders: [h("Authorization", "Bearer abc")],
    });
    const out = searchEntries(
      [e],
      q({ name: "AUTHORIZATION", caseSensitive: true }),
    );
    expect(out.hits).toHaveLength(0);
  });

  it("caseSensitive=true matches when case is exact", () => {
    const e = makeEntry({
      requestHeaders: [h("Authorization", "Bearer abc")],
    });
    const out = searchEntries(
      [e],
      q({ name: "Authorization", caseSensitive: true }),
    );
    expect(out.hits).toHaveLength(1);
  });

  it("default (caseSensitive=false) matches cookie names regardless of case", () => {
    const e = makeEntry({
      requestCookies: [{ name: "SessionId", value: "abc" }],
    });
    const out = searchEntries([e], q({ name: "sessionid" }));
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].matches[0].location).toBe("request-cookie");
  });
});

describe("searchEntries — mode semantics", () => {
  it("exact mode rejects partial header-name matches", () => {
    const e = makeEntry({ requestHeaders: [h("Authorization-X", "v")] });
    const out = searchEntries([e], q({ name: "Authorization", mode: "exact" }));
    expect(out.hits).toHaveLength(0);
  });

  it("exact mode accepts only full header-name matches", () => {
    const e = makeEntry({ requestHeaders: [h("Authorization", "v")] });
    const out = searchEntries([e], q({ name: "Authorization", mode: "exact" }));
    expect(out.hits).toHaveLength(1);
  });

  it("regex mode matches by pattern and supplies match ranges", () => {
    const e = makeEntry({
      requestHeaders: [h("X-Trace-Id", "abc"), h("Accept", "v")],
    });
    const out = searchEntries([e], q({ name: "^x-", mode: "regex" }));
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].matches).toHaveLength(1);
    expect(out.hits[0].matches[0].name).toBe("X-Trace-Id");
    expect(out.hits[0].matches[0].nameRanges).toEqual([{ start: 0, end: 2 }]);
  });

  it("invalid regex returns no hits and reports the error (no throw)", () => {
    const e = makeEntry({ requestHeaders: [h("X-Trace", "v")] });
    const out = searchEntries([e], q({ name: "[unclosed", mode: "regex" }));
    expect(out.hits).toHaveLength(0);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].side).toBe("name");
  });
});

describe("searchEntries — summary", () => {
  it("counts distinct files touched by hits", () => {
    const e1 = makeEntry({
      harFileIndex: 0,
      requestHeaders: [h("X-Foo", "1")],
    });
    const e2 = makeEntry({
      harFileIndex: 1,
      requestHeaders: [h("X-Foo", "2")],
    });
    const e3 = makeEntry({
      harFileIndex: 1,
      requestHeaders: [h("Other", "z")],
    });
    const out = searchEntries([e1, e2, e3], q({ name: "X-Foo" }));
    expect(out.summary.totalHits).toBe(2);
    expect(out.summary.totalMatches).toBe(2);
    expect(out.summary.filesTouched).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// URL pre-filter
// ---------------------------------------------------------------------------

describe("searchEntries — url pre-filter", () => {
  it("narrows hits to entries whose URL contains the needle", () => {
    const a = makeEntry({
      url: "https://api.example.com/v1/users",
      requestHeaders: [h("X-Foo", "1")],
    });
    const b = makeEntry({
      url: "https://cdn.example.com/assets/app.js",
      requestHeaders: [h("X-Foo", "2")],
    });
    const out = searchEntries([a, b], q({ name: "X-Foo", url: "/v1/" }));
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].entry.url).toBe("https://api.example.com/v1/users");
  });

  it("url filter is case-insensitive regardless of caseSensitive flag", () => {
    const e = makeEntry({
      url: "https://API.example.com/Users",
      requestHeaders: [h("X-Foo", "v")],
    });
    const out = searchEntries(
      [e],
      q({ name: "X-Foo", url: "api.example", caseSensitive: true }),
    );
    expect(out.hits).toHaveLength(1);
  });

  it("url filter alone does not produce results without name/value", () => {
    const e = makeEntry({
      url: "https://api.example.com/v1/users",
      requestHeaders: [h("X-Foo", "v")],
    });
    const out = searchEntries([e], q({ url: "api.example" }));
    expect(out.hits).toHaveLength(0);
    expect(out.summary.totalHits).toBe(0);
  });

  it("empty url string is treated as a wildcard (no narrowing)", () => {
    const a = makeEntry({
      url: "https://api.example.com/v1/users",
      requestHeaders: [h("X-Foo", "1")],
    });
    const b = makeEntry({
      url: "https://cdn.example.com/x",
      requestHeaders: [h("X-Foo", "2")],
    });
    const out = searchEntries([a, b], q({ name: "X-Foo", url: "" }));
    expect(out.hits).toHaveLength(2);
  });

  it("composes with scope/case-sensitive name matcher", () => {
    const a = makeEntry({
      url: "https://api.example.com/v1/users",
      requestHeaders: [h("X-Foo", "1")],
      responseHeaders: [h("x-foo", "2")],
    });
    const b = makeEntry({
      url: "https://cdn.example.com/asset",
      requestHeaders: [h("X-Foo", "3")],
    });
    const out = searchEntries(
      [a, b],
      q({
        name: "X-Foo",
        url: "api.example",
        caseSensitive: true,
        scope: new Set<KvLocation>(["request-header"]),
      }),
    );
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].entry.url).toBe("https://api.example.com/v1/users");
    expect(out.hits[0].matches).toHaveLength(1);
    expect(out.hits[0].matches[0].location).toBe("request-header");
  });
});

// ---------------------------------------------------------------------------
// Scope param helpers
// ---------------------------------------------------------------------------

describe("parseScopeParam / serializeScopeParam", () => {
  it("parseScopeParam returns all locations when raw is null", () => {
    const s = parseScopeParam(null);
    for (const loc of KV_LOCATIONS) expect(s.has(loc)).toBe(true);
  });

  it("parseScopeParam decodes the compact comma-separated list", () => {
    const s = parseScopeParam("rh,sc");
    expect(s.has("request-header")).toBe(true);
    expect(s.has("response-cookie")).toBe(true);
    expect(s.has("response-header")).toBe(false);
    expect(s.has("request-cookie")).toBe(false);
  });

  it("parseScopeParam ignores whitespace and unknown tokens", () => {
    const s = parseScopeParam("rh,  bogus , sh ");
    expect(s.has("request-header")).toBe(true);
    expect(s.has("response-header")).toBe(true);
    expect(s.size).toBe(2);
  });

  it("parseScopeParam of empty string returns an empty set", () => {
    expect(parseScopeParam("").size).toBe(0);
  });

  it("serializeScopeParam emits tokens in canonical order", () => {
    const full = new Set<KvLocation>(KV_LOCATIONS);
    expect(serializeScopeParam(full)).toBe("rh,sh,rc,sc");
  });

  it("serialize ↔ parse is a round-trip for a subset", () => {
    const subset = new Set<KvLocation>(["request-cookie", "response-header"]);
    const round = parseScopeParam(serializeScopeParam(subset));
    expect(round.has("request-cookie")).toBe(true);
    expect(round.has("response-header")).toBe(true);
    expect(round.size).toBe(2);
  });
});
