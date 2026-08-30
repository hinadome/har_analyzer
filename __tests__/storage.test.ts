import { describe, it, expect } from "vitest";
import {
  HAR_STORE_VERSION,
  bodyStorageKey,
  prepareStoreForPersist,
  migrateLegacyStore,
  collectBodyIds,
} from "@/utils/storage";
import type { EntryRecord, HarStore } from "@/types/har";

function entry(partial: Partial<EntryRecord> & Pick<EntryRecord, "url">): EntryRecord {
  return {
    method: "GET",
    status: 200,
    statusText: "OK",
    contentType: "text/plain",
    contentSize: 0,
    bodySize: 0,
    time: 1,
    timings: { send: 0, wait: 1, receive: 0 },
    harFileName: "a.har",
    harFileIndex: 0,
    requestHeaders: [],
    responseHeaders: [],
    requestCookies: [],
    responseCookies: [],
    serverIPAddress: "",
    userAgent: "",
    startedDateTime: "2020-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("prepareStoreForPersist", () => {
  it("strips responseContent and collects cold body pairs", () => {
    const store: HarStore = {
      analyses: [
        {
          fileName: "a.har",
          fileIndex: 0,
          totalRequests: 1,
          totalContentSize: 4,
          statusCodeCounts: { 200: 1 },
          methodCounts: { GET: 1 },
          contentTypeCounts: { "text/plain": 1 },
          contentSizeBucketCounts: {},
          serverIPCounts: {},
          uniqueUrlCount: 1,
          entries: [
            entry({
              url: "https://x",
              responseContent: "body",
              hasResponseBody: true,
              bodyId: "id-1",
            }),
          ],
        },
      ],
    };

    const { hot, bodies } = prepareStoreForPersist(store);
    expect(hot.version).toBe(HAR_STORE_VERSION);
    expect(hot.analyses[0].entries[0].responseContent).toBeUndefined();
    expect(hot.analyses[0].entries[0].hasResponseBody).toBe(true);
    expect(hot.analyses[0].entries[0].bodyId).toBe("id-1");
    expect(bodies).toEqual([[bodyStorageKey("id-1"), "body"]]);
    // Original untouched
    expect(store.analyses[0].entries[0].responseContent).toBe("body");
  });

  it("skips entries without body text", () => {
    const store: HarStore = {
      analyses: [
        {
          fileName: "a.har",
          fileIndex: 0,
          totalRequests: 1,
          totalContentSize: 0,
          statusCodeCounts: {},
          methodCounts: {},
          contentTypeCounts: {},
          contentSizeBucketCounts: {},
          serverIPCounts: {},
          uniqueUrlCount: 1,
          entries: [
            entry({ url: "https://x", hasResponseBody: false }),
          ],
        },
      ],
    };
    const { bodies } = prepareStoreForPersist(store);
    expect(bodies).toEqual([]);
  });
});

describe("migrateLegacyStore", () => {
  it("assigns bodyId and strips inline content", () => {
    const raw: HarStore = {
      analyses: [
        {
          fileName: "legacy.har",
          fileIndex: 0,
          totalRequests: 1,
          totalContentSize: 3,
          statusCodeCounts: {},
          methodCounts: {},
          contentTypeCounts: {},
          contentSizeBucketCounts: {},
          serverIPCounts: {},
          uniqueUrlCount: 1,
          entries: [entry({ url: "https://y", responseContent: "abc" })],
        },
      ],
    };
    const { hot, bodies } = migrateLegacyStore(raw);
    expect(hot.version).toBe(HAR_STORE_VERSION);
    const e = hot.analyses[0].entries[0];
    expect(e.responseContent).toBeUndefined();
    expect(e.hasResponseBody).toBe(true);
    expect(e.bodyId).toBeTruthy();
    expect(bodies).toHaveLength(1);
    expect(bodies[0][1]).toBe("abc");
  });
});

describe("collectBodyIds", () => {
  it("collects defined bodyIds", () => {
    const ids = collectBodyIds([
      {
        fileName: "a.har",
        fileIndex: 0,
        totalRequests: 2,
        totalContentSize: 0,
        statusCodeCounts: {},
        methodCounts: {},
        contentTypeCounts: {},
        contentSizeBucketCounts: {},
        serverIPCounts: {},
        uniqueUrlCount: 2,
        entries: [
          entry({ url: "a", bodyId: "one" }),
          entry({ url: "b" }),
          entry({ url: "c", bodyId: "two" }),
        ],
      },
    ]);
    expect(ids).toEqual(["one", "two"]);
  });
});
