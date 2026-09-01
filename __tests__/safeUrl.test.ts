import { describe, expect, it } from "vitest";
import { isNavigableHttpUrl } from "@/utils/safeUrl";

describe("isNavigableHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isNavigableHttpUrl("https://example.com/path")).toBe(true);
    expect(isNavigableHttpUrl("http://example.com")).toBe(true);
  });

  it("rejects javascript, data, and relative URLs", () => {
    expect(isNavigableHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isNavigableHttpUrl("data:text/html,<script>")).toBe(false);
    expect(isNavigableHttpUrl("/relative/path")).toBe(false);
    expect(isNavigableHttpUrl("")).toBe(false);
  });
});
