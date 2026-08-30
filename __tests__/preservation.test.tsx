/**
 * Preservation property tests against production Cell + entry search helpers.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { EntryRecord } from "@/types/har";
import { formatBytes } from "@/utils/harParser";
import { ComparisonTableCell as Cell } from "@/components/ComparisonTable";
import { filterEntriesBySearch } from "@/utils/entrySearch";

describe("Cell — undefined renders dash", () => {
  it('Cell({ value: undefined }) renders "—"', () => {
    const { container } = render(<Cell value={undefined} />);
    expect(container.textContent).toBe("—");
  });
});

describe("Cell — positive integer renders formatted number", () => {
  it('Cell({ value: 1 }) renders "1"', () => {
    const { container } = render(<Cell value={1} />);
    expect(container.textContent).toBe("1");
  });

  it('Cell({ value: 42 }) renders "42"', () => {
    const { container } = render(<Cell value={42} />);
    expect(container.textContent).toBe("42");
  });

  it('Cell({ value: 1000 }) renders a string containing "1" and "000"', () => {
    const { container } = render(<Cell value={1000} />);
    const text = container.textContent ?? "";
    expect(text).toContain("1");
    expect(text).toContain("000");
    expect(text).not.toBe("—");
  });
});

describe('formatBytes — zero returns "0 B"', () => {
  it('formatBytes(0) returns "0 B"', () => {
    expect(formatBytes(0)).toBe("0 B");
  });
});

describe("formatBytes — positive values return correct strings", () => {
  it('formatBytes(1) returns "1.0 B"', () => {
    expect(formatBytes(1)).toBe("1.0 B");
  });

  it('formatBytes(1024) returns "1.0 KB"', () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it('formatBytes(1048576) returns "1.0 MB"', () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });
});

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    harFileName: "test.har",
    url: "https://example.com/api/data",
    contentType: "application/json",
    status: 200,
    method: "GET",
    statusText: "OK",
    contentSize: 512,
    bodySize: 512,
    time: 100,
    timings: { send: 1, wait: 50, receive: 49 },
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

describe("Search filter — matches on url, contentType, status", () => {
  it("query matching url includes the entry", () => {
    const entry = makeEntry({ url: "https://example.com/api/data" });
    expect(filterEntriesBySearch([entry], "api/data").length).toBeGreaterThan(
      0,
    );
  });

  it("query matching contentType includes the entry", () => {
    const entry = makeEntry({ contentType: "application/json" });
    expect(
      filterEntriesBySearch([entry], "application/json").length,
    ).toBeGreaterThan(0);
  });

  it("query matching status includes the entry", () => {
    const entry = makeEntry({ status: 200 });
    expect(filterEntriesBySearch([entry], "200").length).toBeGreaterThan(0);
  });

  it("empty query returns all entries unfiltered", () => {
    const entries = [makeEntry(), makeEntry({ url: "https://other.com" })];
    expect(filterEntriesBySearch(entries, "").length).toBe(2);
  });

  it("whitespace-only query returns all entries unfiltered", () => {
    const entries = [makeEntry(), makeEntry()];
    expect(filterEntriesBySearch(entries, "   ").length).toBe(2);
  });
});

describe("Search filter — non-matching query excludes entry", () => {
  it("query that matches no field excludes the entry", () => {
    const entry = makeEntry({
      url: "https://example.com/page",
      contentType: "text/html",
      status: 200,
    });
    expect(filterEntriesBySearch([entry], "zzznomatch").length).toBe(0);
  });
});
