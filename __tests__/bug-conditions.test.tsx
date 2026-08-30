/**
 * Bug condition tests against production Cell + entry search helpers.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { EntryRecord } from "@/types/har";
import { formatBytes } from "@/utils/harParser";
import { ComparisonTableCell } from "@/components/ComparisonTable";
import { filterEntriesBySearch } from "@/utils/entrySearch";

describe("Bug 1 — Cell zero-value guard", () => {
  it('Cell(0) should render "0", not "—"', () => {
    const { container } = render(<ComparisonTableCell value={0} />);
    expect(container.textContent).toBe("0");
    expect(container.textContent).not.toBe("—");
  });
});

describe("Bug 7 — formatBytes sentinel handling", () => {
  it('formatBytes(-1) should return "N/A", not "0 B"', () => {
    expect(formatBytes(-1)).toBe("N/A");
  });

  it('formatBytes(-999) should return "N/A", not "0 B"', () => {
    expect(formatBytes(-999)).toBe("N/A");
  });
});

describe("Bug 8 — Search filter missing harFileName", () => {
  it("searching by harFileName should return matching entries", () => {
    const entry: EntryRecord = {
      harFileName: "api.har",
      url: "https://example.com/totally-unrelated-path",
      contentType: "image/png",
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
    };

    const result = filterEntriesBySearch([entry], "api.har");
    expect(result.length).toBeGreaterThan(0);
  });
});
