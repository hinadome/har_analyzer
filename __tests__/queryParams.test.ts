import { describe, expect, it } from "vitest";
import { parseExpandParam, MAX_EXPAND_QUERY_LENGTH } from "@/utils/queryParams";

describe("parseExpandParam", () => {
  it("returns empty for null/empty", () => {
    expect(parseExpandParam(null)).toBe("");
    expect(parseExpandParam("")).toBe("");
  });

  it("returns value when within length cap", () => {
    expect(parseExpandParam("/api/v1/users")).toBe("/api/v1/users");
  });

  it("returns empty when over max length", () => {
    const long = "x".repeat(MAX_EXPAND_QUERY_LENGTH + 1);
    expect(parseExpandParam(long)).toBe("");
  });
});
