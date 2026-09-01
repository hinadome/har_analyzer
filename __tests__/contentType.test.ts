import { describe, it, expect } from "vitest";
import {
  normalizeContentType,
  resolveContentType,
  enrichEntryContentType,
  rebuildContentTypeCounts,
  JUNK_HAR_MIME_TYPES,
} from "@/utils/contentType";
import type { EntryRecord } from "@/types/har";

describe("normalizeContentType", () => {
  it("strips charset and lowercases", () => {
    expect(normalizeContentType("text/javascript; charset=utf-8")).toBe(
      "text/javascript",
    );
  });

  it("empty becomes unknown", () => {
    expect(normalizeContentType("")).toBe("unknown");
  });
});

describe("resolveContentType", () => {
  it("uses header when HAR content is x-unknown", () => {
    const r = resolveContentType("x-unknown", [
      { name: "Content-Type", value: "text/javascript; charset=utf-8" },
    ]);
    expect(r.contentMimeType).toBe("x-unknown");
    expect(r.headerContentType).toBe("text/javascript");
    expect(r.contentType).toBe("text/javascript");
    expect(r.contentTypeFromHeader).toBe(true);
    expect(r.contentTypeSourcesAgree).toBe(false);
  });

  it("agrees when both match", () => {
    const r = resolveContentType("application/json", [
      { name: "Content-Type", value: "application/json" },
    ]);
    expect(r.contentTypeSourcesAgree).toBe(true);
    expect(r.contentType).toBe("application/json");
  });

  it("flags disagree when both are real and differ", () => {
    const r = resolveContentType("text/plain", [
      { name: "Content-Type", value: "application/json" },
    ]);
    expect(r.contentType).toBe("text/plain");
    expect(r.contentTypeSourcesAgree).toBe(false);
    expect(r.contentTypeFromHeader).toBe(false);
  });
});

describe("enrichEntryContentType", () => {
  it("backfills legacy entry from headers on load", () => {
    const legacy: EntryRecord = {
      harFileIndex: 0,
      harFileName: "a.har",
      indexInFile: 0,
      url: "https://example.com/app.js",
      method: "GET",
      status: 200,
      statusText: "OK",
      contentType: "x-unknown",
      contentMimeType: "x-unknown",
      headerContentType: "",
      contentTypeFromHeader: false,
      contentTypeSourcesAgree: true,
      contentSize: 0,
      bodySize: 0,
      time: 0,
      startedDateTime: "",
      requestHeaders: [],
      responseHeaders: [
        { name: "Content-Type", value: "text/javascript; charset=utf-8" },
      ],
      requestCookies: [],
      responseCookies: [],
      serverIPAddress: "",
      userAgent: "",
    };
  // Fix legacy without contentMimeType
    const { contentMimeType: _a, ...withoutMime } = legacy;
    const enriched = enrichEntryContentType({
      ...withoutMime,
      contentType: "x-unknown",
    } as EntryRecord);
    expect(enriched.contentType).toBe("text/javascript");
    expect(enriched.contentMimeType).toBe("x-unknown");
    expect(enriched.headerContentType).toBe("text/javascript");
    expect(enriched.contentTypeSourcesAgree).toBe(false);
  });
});

describe("rebuildContentTypeCounts", () => {
  it("uses effective contentType", () => {
    const counts = rebuildContentTypeCounts([
      {
        contentType: "text/javascript",
      } as EntryRecord,
      {
        contentType: "text/javascript",
      } as EntryRecord,
    ]);
    expect(counts).toEqual({ "text/javascript": 2 });
  });
});

describe("JUNK_HAR_MIME_TYPES", () => {
  it("includes x-unknown", () => {
    expect(JUNK_HAR_MIME_TYPES.has("x-unknown")).toBe(true);
  });
});
