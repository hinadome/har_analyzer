/**
 * Tests for utils/base64.ts
 * Covers: decodeBase64ToText (valid UTF-8, whitespace, binary rejection,
 *         invalid input) and looksLikeBase64 (positive detection + the common
 *         false positives it must reject).
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import {
  looksLikeBase64,
  decodeBase64ToText,
  MIN_BASE64_LENGTH,
} from "@/utils/base64";

// Node has Buffer; use it to build fixtures.
function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

// ---------------------------------------------------------------------------
// decodeBase64ToText
// ---------------------------------------------------------------------------

describe("decodeBase64ToText", () => {
  it("decodes base64 of ASCII text", () => {
    expect(decodeBase64ToText(b64("Hello, world!"))).toBe("Hello, world!");
  });

  it("decodes base64 of a JSON payload", () => {
    const json = '{"id":42,"name":"widget"}';
    expect(decodeBase64ToText(b64(json))).toBe(json);
  });

  it("decodes multi-byte UTF-8 (emoji / accents)", () => {
    const s = "café — 日本語 — 🚀";
    expect(decodeBase64ToText(b64(s))).toBe(s);
  });

  it("ignores embedded whitespace / line breaks", () => {
    const raw = b64("The quick brown fox jumps over the lazy dog");
    const chunked = raw.replace(/(.{8})/g, "$1\n");
    expect(decodeBase64ToText(chunked)).toBe(
      "The quick brown fox jumps over the lazy dog",
    );
  });

  it("returns null for non-base64 input", () => {
    expect(decodeBase64ToText("not base64!!!")).toBeNull();
    expect(decodeBase64ToText("")).toBeNull();
    expect(decodeBase64ToText(null)).toBeNull();
    expect(decodeBase64ToText(undefined)).toBeNull();
  });

  it("returns null when length is not a multiple of 4", () => {
    expect(decodeBase64ToText("YWJj YQ")).toBeNull();
  });

  it("returns null for binary (non-UTF-8) payloads", () => {
    // Bytes 0xFF 0xFE 0x00 0x01 are not valid UTF-8.
    const binary = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x03]).toString(
      "base64",
    );
    expect(decodeBase64ToText(binary)).toBeNull();
  });

  it("returns null for control-char-heavy decoded output", () => {
    const ctrl = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString("base64");
    expect(decodeBase64ToText(ctrl)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// looksLikeBase64
// ---------------------------------------------------------------------------

describe("looksLikeBase64", () => {
  it("detects base64-encoded text of sufficient length", () => {
    expect(looksLikeBase64(b64("this is a base64 encoded sentence"))).toBe(
      true,
    );
    expect(looksLikeBase64(b64('{"key":"value","n":123}'))).toBe(true);
  });

  it("rejects empty / nullish input", () => {
    expect(looksLikeBase64("")).toBe(false);
    expect(looksLikeBase64(null)).toBe(false);
    expect(looksLikeBase64(undefined)).toBe(false);
  });

  it("rejects strings shorter than the minimum", () => {
    const short = b64("hi"); // "aGk=" → too short
    expect(short.length).toBeLessThan(MIN_BASE64_LENGTH);
    expect(looksLikeBase64(short)).toBe(false);
  });

  it("rejects plain JSON text (not base64)", () => {
    expect(looksLikeBase64('{"message":"hello world, this is json"}')).toBe(
      false,
    );
  });

  it("rejects plain prose with spaces and punctuation", () => {
    expect(
      looksLikeBase64("The quick brown fox jumps over the lazy dog."),
    ).toBe(false);
  });

  it("rejects a base64 string whose payload is binary", () => {
    const binary = Buffer.from([
      0xff, 0xfe, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
    ]).toString("base64");
    expect(looksLikeBase64(binary)).toBe(false);
  });

  it("rejects when non-trailing '=' padding is present", () => {
    // '=' in the middle is not valid base64 padding.
    expect(looksLikeBase64("QUJD=EFGQUJDQUJDQUJD")).toBe(false);
  });

  it("accepts whitespace-chunked base64", () => {
    const raw = b64("a reasonably long base64 payload to detect");
    const chunked = raw.replace(/(.{10})/g, "$1\n");
    expect(looksLikeBase64(chunked)).toBe(true);
  });
});
