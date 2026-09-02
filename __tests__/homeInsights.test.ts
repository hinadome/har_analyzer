import { describe, it, expect } from "vitest";
import {
  computeHomeInsights,
  corsInsightSubtitle,
  corsInsightTitle,
  corsInsightTone,
  shouldShowCorsInsight,
  errorCountFromStatusMap,
  fileInsight,
} from "@/utils/homeInsights";
import type { HarAnalysis } from "@/types/har";
import type { CorsReport } from "@/utils/corsAnalysis";

function makeAnalysis(
  overrides: Partial<HarAnalysis> & Pick<HarAnalysis, "fileName" | "fileIndex">,
): HarAnalysis {
  return {
    totalRequests: 0,
    totalContentSize: 0,
    statusCodeCounts: {},
    methodCounts: {},
    contentTypeCounts: {},
    contentSizeBucketCounts: {},
    serverIPCounts: {},
    uniqueUrlCount: 0,
    entries: [],
    ...overrides,
  };
}

describe("errorCountFromStatusMap", () => {
  it("counts 0 and >=400 as errors", () => {
    expect(
      errorCountFromStatusMap({ 200: 10, 404: 2, 500: 1, 0: 3, 301: 4 }),
    ).toBe(6);
  });

  it("handles missing map", () => {
    expect(errorCountFromStatusMap(undefined)).toBe(0);
  });
});

describe("computeHomeInsights", () => {
  it("sums rollups without needing entries", () => {
    const insights = computeHomeInsights(
      [
        makeAnalysis({
          fileName: "a.har",
          fileIndex: 0,
          totalRequests: 100,
          totalContentSize: 1000,
          statusCodeCounts: { 200: 90, 500: 10 },
          uniqueUrlCount: 40,
        }),
        makeAnalysis({
          fileName: "b.har",
          fileIndex: 1,
          totalRequests: 120,
          totalContentSize: 2000,
          statusCodeCounts: { 200: 100, 404: 20 },
          uniqueUrlCount: 50,
        }),
      ],
      null,
    );
    expect(insights.totalRequests).toBe(220);
    expect(insights.totalContentSize).toBe(3000);
    expect(insights.totalErrors).toBe(30);
    expect(insights.pair).toEqual({
      baseIndex: 0,
      cmpIndex: 1,
      baseName: "a.har",
      cmpName: "b.har",
      deltaRequests: 20,
      deltaErrors: 10,
      deltaBytes: 1000,
    });
    expect(insights.cors).toBeNull();
  });

  it("omits pair when only one file", () => {
    const insights = computeHomeInsights(
      [
        makeAnalysis({
          fileName: "solo.har",
          fileIndex: 0,
          totalRequests: 5,
        }),
      ],
      null,
    );
    expect(insights.pair).toBeNull();
    expect(insights.files).toHaveLength(1);
  });

  it("includes CORS summary only when cross-origin > 0", () => {
    const report = {
      crossOriginCount: 3,
      errorCount: 1,
      warningCount: 2,
    } as CorsReport;
    const withCors = computeHomeInsights(
      [makeAnalysis({ fileName: "a.har", fileIndex: 0 })],
      report,
    );
    expect(withCors.cors).toEqual({
      crossOriginCount: 3,
      errorCount: 1,
      warningCount: 2,
    });

    const zero = computeHomeInsights(
      [makeAnalysis({ fileName: "a.har", fileIndex: 0 })],
      { crossOriginCount: 0, errorCount: 0, warningCount: 0 } as CorsReport,
    );
    expect(zero.cors).toBeNull();
  });
});

describe("corsInsightTitle / tone", () => {
  it("uses error / warning / clear copy", () => {
    expect(
      corsInsightTone({ errorCount: 2, warningCount: 1 }),
    ).toBe("error");
    expect(
      corsInsightTitle({
        crossOriginCount: 5,
        errorCount: 2,
        warningCount: 1,
      }),
    ).toBe("CORS audit — 2 errors");

    expect(
      corsInsightTone({ errorCount: 0, warningCount: 3 }),
    ).toBe("warning");
    expect(
      corsInsightTitle({
        crossOriginCount: 5,
        errorCount: 0,
        warningCount: 1,
      }),
    ).toBe("CORS — 1 warning");

    expect(
      corsInsightTone({ errorCount: 0, warningCount: 0 }),
    ).toBe("clear");
    expect(
      corsInsightTitle({
        crossOriginCount: 4,
        errorCount: 0,
        warningCount: 0,
      }),
    ).toBe("4 cross-origin requests — all clear");
    expect(
      corsInsightSubtitle({
        crossOriginCount: 4,
        errorCount: 0,
        warningCount: 0,
      }),
    ).toMatch(/Browse/i);
  });

  it("shows insight strip only when audit has errors or warnings", () => {
    expect(
      shouldShowCorsInsight({ errorCount: 1, warningCount: 0 }),
    ).toBe(true);
    expect(
      shouldShowCorsInsight({ errorCount: 0, warningCount: 2 }),
    ).toBe(true);
    expect(
      shouldShowCorsInsight({ errorCount: 0, warningCount: 0 }),
    ).toBe(false);
  });
});

describe("fileInsight", () => {
  it("maps analysis fields", () => {
    const f = fileInsight(
      makeAnalysis({
        fileName: "x.har",
        fileIndex: 2,
        totalRequests: 7,
        totalContentSize: 99,
        statusCodeCounts: { 200: 5, 0: 2 },
        uniqueUrlCount: 3,
      }),
    );
    expect(f).toEqual({
      fileIndex: 2,
      fileName: "x.har",
      totalRequests: 7,
      totalContentSize: 99,
      errorCount: 2,
      uniqueUrlCount: 3,
    });
  });
});
