import { describe, it, expect } from "vitest";
import {
  countHeaderChanges,
  contentTabStatus,
  defaultEntryDiffSection,
  entryDiffRedirectTarget,
  headerTabStatus,
  parseEntryDiffSection,
} from "@/utils/entryDiff";
import type { HeaderDiffResult } from "@/utils/headerDiff";
import type { EntryRecord } from "@/types/har";

function stubEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    harFileIndex: 0,
    harFileName: "a.har",
    indexInFile: 0,
    url: "https://example.com/hello",
    method: "GET",
    status: 200,
    contentType: "application/json",
    contentSize: 10,
    time: 50,
    startedDateTime: "2026-01-01T00:00:00.000Z",
    requestHeaders: [],
    responseHeaders: [],
    requestCookies: [],
    responseCookies: [],
    hasResponseBody: true,
    responseContent: "{}",
    ...overrides,
  };
}

describe("parseEntryDiffSection", () => {
  it("defaults to headers", () => {
    expect(parseEntryDiffSection(null)).toBe("headers");
    expect(parseEntryDiffSection("headers")).toBe("headers");
  });

  it("accepts content", () => {
    expect(parseEntryDiffSection("content")).toBe("content");
  });
});

describe("headerTabStatus", () => {
  it("returns identical when all sections match", () => {
    const result: HeaderDiffResult = {
      requestHeaders: [
        {
          name: "Accept",
          baseValue: "text/html",
          compareValue: "text/html",
          kind: "equal",
        },
      ],
      responseHeaders: [],
      requestCookies: [],
      responseCookies: [],
      identical: true,
    };
    expect(headerTabStatus(result)).toBe("identical");
  });

  it("counts non-equal rows", () => {
    const result: HeaderDiffResult = {
      requestHeaders: [
        {
          name: "Accept",
          baseValue: "a",
          compareValue: "b",
          kind: "changed",
        },
      ],
      responseHeaders: [
        {
          name: "X",
          baseValue: undefined,
          compareValue: "1",
          kind: "added",
        },
      ],
      requestCookies: [],
      responseCookies: [],
      identical: false,
    };
    expect(countHeaderChanges(result)).toBe(2);
    expect(headerTabStatus(result)).toBe("2 changes");
  });
});

describe("contentTabStatus", () => {
  it("labels binary and no-body entries without loading", () => {
    const binary = stubEntry({ contentType: "image/png", hasResponseBody: true });
    const text = stubEntry();
    expect(contentTabStatus(text, text, null, false)).toBe("text");
    expect(contentTabStatus(binary, text, null, false)).toBe("binary");

    const noBody = stubEntry({ hasResponseBody: false, responseContent: undefined });
    expect(contentTabStatus(noBody, noBody, null, false)).toBe("no body");
  });

  it("reports identical text diff", () => {
    const a = stubEntry({ responseContent: "same" });
    const b = stubEntry({ responseContent: "same" });
    expect(
      contentTabStatus(
        a,
        b,
        { identical: true, prettified: false, leftLines: [], rightLines: [], unifiedLines: [] },
        false,
      ),
    ).toBe("identical");
  });
});

describe("defaultEntryDiffSection", () => {
  it("opens headers when header diff has changes", () => {
    const result: HeaderDiffResult = {
      requestHeaders: [
        {
          name: "A",
          baseValue: "1",
          compareValue: "2",
          kind: "changed",
        },
      ],
      responseHeaders: [],
      requestCookies: [],
      responseCookies: [],
      identical: false,
    };
    expect(defaultEntryDiffSection(result)).toBe("headers");
  });

  it("opens content when headers are identical", () => {
    const result: HeaderDiffResult = {
      requestHeaders: [],
      responseHeaders: [],
      requestCookies: [],
      responseCookies: [],
      identical: true,
    };
    expect(defaultEntryDiffSection(result)).toBe("content");
  });
});

describe("entryDiffRedirectTarget", () => {
  it("preserves url and other query params", () => {
    expect(entryDiffRedirectTarget("content", "?url=/hello&foo=1")).toBe(
      "/entry-diff?url=%2Fhello&foo=1&section=content",
    );
  });

  it("sets section when the query is empty", () => {
    expect(entryDiffRedirectTarget("headers", "")).toBe(
      "/entry-diff?section=headers",
    );
  });
});
