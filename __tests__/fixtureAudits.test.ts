import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import type { HarFile } from "@/types/har";
import { analyzeHar } from "@/utils/harParser";
import { analyzeStore as analyzeMime } from "@/utils/mimeMismatch";
import { analyzeStore as analyzeCache } from "@/utils/cacheValidator";
import { analyzeStore as analyzeAnomalies } from "@/utils/anomalies";

const fixturePath = join(process.cwd(), "sample-hars", "fixture-audits.har");

function loadFixtureAnalysis() {
  const har = JSON.parse(readFileSync(fixturePath, "utf8")) as HarFile;
  return analyzeHar(har, "fixture-audits.har", 0);
}

describe("sample-hars/fixture-audits.har", () => {
  const analysis = loadFixtureAnalysis();

  it("loads and parses", () => {
    expect(analysis.entries.length).toBe(13);
  });

  it("triggers MIME mismatch", () => {
    const report = analyzeMime([analysis]);
    expect(report.mismatchCount).toBeGreaterThanOrEqual(1);
  });

  it("triggers cache validator drift", () => {
    const report = analyzeCache([analysis]);
    expect(report.pathConflictCount).toBeGreaterThanOrEqual(1);
  });

  it("triggers anomalies across categories", () => {
    const report = analyzeAnomalies([analysis]);
    expect(report.status.pathGroupCount).toBeGreaterThanOrEqual(1);
    expect(report.size.pathGroupCount).toBeGreaterThanOrEqual(1);
    expect(report.encoding.pathGroupCount).toBeGreaterThanOrEqual(2);
    expect(report.cachePolicy.pathGroupCount).toBeGreaterThanOrEqual(1);
    expect(report.uniquePathCount).toBeGreaterThanOrEqual(4);
  });

  it("includes content-type resolution split on bundle entry", () => {
    const mjs = analysis.entries.find((e) => e.url.includes("/bundle/app.mjs"));
    expect(mjs?.contentMimeType).toBe("x-unknown");
    expect(mjs?.contentTypeFromHeader).toBe(true);
    expect(mjs?.contentTypeSourcesAgree).toBe(false);
  });
});
