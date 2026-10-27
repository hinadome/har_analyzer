/**
 * Tests for utils/hostname.ts
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import { hostOf, groupByHostname } from "@/utils/hostname";

describe("hostOf", () => {
  it("extracts host (with port) from a URL", () => {
    expect(hostOf("https://api.example.com/v1/users")).toBe("api.example.com");
    expect(hostOf("http://localhost:3000/x")).toBe("localhost:3000");
  });

  it("falls back for unparseable URLs", () => {
    expect(hostOf("not a url")).toBe("(invalid URL)");
    expect(hostOf("/relative/path")).toBe("(invalid URL)");
  });
});

describe("groupByHostname", () => {
  it("groups items by host, sorts hosts a–z, preserves input order within a host", () => {
    const items = [
      { url: "https://b.com/2" },
      { url: "https://a.com/x" },
      { url: "https://b.com/1" },
    ];
    const groups = groupByHostname(items, (i) => i.url);
    expect(groups.map((g) => g.host)).toEqual(["a.com", "b.com"]);
    // b.com keeps input order (/2 before /1).
    expect(groups[1].items.map((i) => i.url)).toEqual([
      "https://b.com/2",
      "https://b.com/1",
    ]);
  });

  it("buckets unparseable URLs under the fallback host", () => {
    const groups = groupByHostname([{ url: "garbage" }], (i) => i.url);
    expect(groups).toHaveLength(1);
    expect(groups[0].host).toBe("(invalid URL)");
  });

  it("returns an empty array for no items", () => {
    expect(groupByHostname([], (i: { url: string }) => i.url)).toEqual([]);
  });
});
