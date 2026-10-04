/**
 * Tests for utils/contentSearch.ts
 * Covers: searchContent (contains/exact/regex, case sensitivity, URL
 *         pre-filter, missing bodies, invalid regex, summary) and
 *         buildSnippets (window merging, snippet-local ranges, caps).
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import {
  searchContent,
  buildSnippets,
  contentEntryId,
  type ContentSearchQuery,
  type EntryBody,
} from "@/utils/contentSearch";
import type { EntryRecord } from "@/types/har";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    url: "https://api.example.com/v1/users",
    method: "GET",
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    contentMimeType: "application/json",
    headerContentType: "application/json",
    contentTypeFromHeader: false,
    contentTypeSourcesAgree: true,
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
    indexInFile: 0,
    startedDateTime: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function rec(body: string | undefined, overrides: Partial<EntryRecord> = {}): EntryBody {
  return { entry: makeEntry(overrides), body };
}

function q(overrides: Partial<ContentSearchQuery> = {}): ContentSearchQuery {
  return {
    text: "",
    mode: "contains",
    caseSensitive: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// searchContent — basic matching
// ---------------------------------------------------------------------------

describe("searchContent", () => {
  it("returns no hits for an empty needle", () => {
    const out = searchContent([rec('{"a":1}')], q({ text: "" }));
    expect(out.hits).toHaveLength(0);
    expect(out.summary.totalHits).toBe(0);
    expect(out.errors).toHaveLength(0);
  });

  it("finds a contains match and counts occurrences", () => {
    const out = searchContent(
      [rec("error error ok error")],
      q({ text: "error" }),
    );
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].matchCount).toBe(3);
    expect(out.summary.totalMatches).toBe(3);
    expect(out.summary.totalHits).toBe(1);
  });

  it("is case-insensitive by default and case-sensitive when asked", () => {
    const ci = searchContent([rec("Hello HELLO hello")], q({ text: "hello" }));
    expect(ci.hits[0].matchCount).toBe(3);

    const cs = searchContent(
      [rec("Hello HELLO hello")],
      q({ text: "hello", caseSensitive: true }),
    );
    expect(cs.hits[0].matchCount).toBe(1);
  });

  it("exact mode matches only a whole-body equality", () => {
    const match = searchContent([rec("ok")], q({ text: "ok", mode: "exact" }));
    expect(match.hits).toHaveLength(1);

    const noMatch = searchContent(
      [rec("ok then not")],
      q({ text: "ok", mode: "exact" }),
    );
    expect(noMatch.hits).toHaveLength(0);
  });

  it("regex mode finds pattern matches", () => {
    const out = searchContent(
      [rec('{"id":42,"id":99}')],
      q({ text: "id\":\\d+", mode: "regex" }),
    );
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].matchCount).toBe(2);
  });

  it("reports an invalid regex and returns no hits", () => {
    const out = searchContent([rec("abc")], q({ text: "(", mode: "regex" }));
    expect(out.hits).toHaveLength(0);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// searchContent — bodies & URL pre-filter
// ---------------------------------------------------------------------------

describe("searchContent body handling", () => {
  it("skips entries without a loaded body and counts them", () => {
    const out = searchContent(
      [rec(undefined), rec("has token here")],
      q({ text: "token" }),
    );
    expect(out.hits).toHaveLength(1);
    expect(out.summary.entriesWithoutBody).toBe(1);
    expect(out.summary.entriesSearched).toBe(1);
  });

  it("does not count empty-string bodies as missing", () => {
    const out = searchContent([rec("")], q({ text: "x" }));
    expect(out.summary.entriesWithoutBody).toBe(0);
    expect(out.summary.entriesSearched).toBe(0);
  });

  it("applies the URL pre-filter case-insensitively", () => {
    const records = [
      rec("secret", { url: "https://a.com/API/login" }),
      rec("secret", { url: "https://a.com/static/app.js" }),
    ];
    const out = searchContent(records, q({ text: "secret", url: "api" }));
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].entry.url).toContain("/API/login");
  });

  it("tracks filesTouched across distinct harFileIndex values", () => {
    const records = [
      rec("x", { harFileIndex: 0 }),
      rec("x", { harFileIndex: 1 }),
      rec("x", { harFileIndex: 1 }),
    ];
    const out = searchContent(records, q({ text: "x" }));
    expect(out.summary.totalHits).toBe(3);
    expect(out.summary.filesTouched).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// buildSnippets
// ---------------------------------------------------------------------------

describe("buildSnippets", () => {
  it("returns no snippets for no ranges", () => {
    expect(buildSnippets("abc", [])).toHaveLength(0);
  });

  it("produces a snippet with ranges rebased to snippet-local coordinates", () => {
    const body = "xxxxxxxxxxFINDMExxxxxxxxxx"; // FINDME at index 10
    const snippets = buildSnippets(body, [{ start: 10, end: 16 }], 4);
    expect(snippets).toHaveLength(1);
    const s = snippets[0];
    // Window starts at 10 - 4 = 6.
    expect(s.offset).toBe(6);
    expect(s.text).toBe(body.slice(6, 20));
    expect(s.ranges).toEqual([{ start: 4, end: 10 }]);
    // The highlighted slice equals the original match text.
    expect(s.text.slice(s.ranges[0].start, s.ranges[0].end)).toBe("FINDME");
  });

  it("merges overlapping windows into a single snippet", () => {
    // Two matches close together → one merged window.
    const body = "a".repeat(100) + "X" + "b".repeat(5) + "X" + "c".repeat(100);
    const first = 100;
    const second = 106;
    const snippets = buildSnippets(
      body,
      [
        { start: first, end: first + 1 },
        { start: second, end: second + 1 },
      ],
      20,
    );
    expect(snippets).toHaveLength(1);
    expect(snippets[0].ranges).toHaveLength(2);
  });

  it("keeps distant matches as separate snippets", () => {
    const body = "X" + "a".repeat(500) + "X";
    const snippets = buildSnippets(
      body,
      [
        { start: 0, end: 1 },
        { start: 501, end: 502 },
      ],
      10,
    );
    expect(snippets).toHaveLength(2);
  });

  it("caps the number of snippets", () => {
    const parts: string[] = [];
    const ranges: { start: number; end: number }[] = [];
    let pos = 0;
    for (let i = 0; i < 30; i++) {
      const filler = "y".repeat(200);
      ranges.push({ start: pos, end: pos + 1 });
      parts.push("X" + filler);
      pos += 1 + filler.length;
    }
    const body = parts.join("");
    const snippets = buildSnippets(body, ranges, 10, 5);
    expect(snippets.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// contentEntryId
// ---------------------------------------------------------------------------

describe("contentEntryId", () => {
  it("combines harFileIndex and indexInFile", () => {
    expect(contentEntryId(makeEntry({ harFileIndex: 2 }), 7)).toBe("2:7");
  });
});
