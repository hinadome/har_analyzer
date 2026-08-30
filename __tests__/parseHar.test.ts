import { describe, it, expect } from "vitest";
import {
  HAR_WORKER_SIZE_THRESHOLD,
  shouldUseHarParseWorker,
  isHarParseWorkerEnabled,
} from "@/utils/parseHar";

describe("parseHar worker gating", () => {
  it("exports a 5 MB threshold", () => {
    expect(HAR_WORKER_SIZE_THRESHOLD).toBe(5 * 1024 * 1024);
  });

  it("shouldUseHarParseWorker is false when worker flag is off", () => {
    // jsdom: localStorage empty, env unset → disabled
    const file = { size: HAR_WORKER_SIZE_THRESHOLD } as File;
    expect(isHarParseWorkerEnabled()).toBe(false);
    expect(shouldUseHarParseWorker(file)).toBe(false);
  });

  it("shouldUseHarParseWorker requires both flag and size", () => {
    const prev = globalThis.localStorage?.getItem("har_parse_worker");
    try {
      globalThis.localStorage?.setItem("har_parse_worker", "1");
      expect(isHarParseWorkerEnabled()).toBe(true);
      expect(
        shouldUseHarParseWorker({ size: HAR_WORKER_SIZE_THRESHOLD - 1 } as File),
      ).toBe(false);
      expect(
        shouldUseHarParseWorker({ size: HAR_WORKER_SIZE_THRESHOLD } as File),
      ).toBe(true);
    } finally {
      if (prev == null) globalThis.localStorage?.removeItem("har_parse_worker");
      else globalThis.localStorage?.setItem("har_parse_worker", prev);
    }
  });
});
